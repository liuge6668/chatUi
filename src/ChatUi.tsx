import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  Button,
  Input,
  List,
  Tooltip,
  Space,
  message as antMessage,
  Spin,
  Popconfirm,
  Alert,
} from "antd";
import {
  RobotOutlined,
  SendOutlined,
  DoubleRightOutlined,
  DoubleLeftOutlined,
  CloseOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import StatusDisplay from "./components/StatusDisplay";
import FloatButton from "./components/FloatButton";
import SanitizedHTML from "./components/SanitizedHTML";
import "./index.css";
import "./chat-window.css";

// 消息类型定义
interface Message {
  id: string;
  content: string;
  role: "user" | "ai";
  timestamp: Date;
  status: "sending" | "sent" | "failed";
  retryCount?: number;
}

const RetryStrategy = {
  Linear: "linear",
  Exponential: "exponential",
  Custom: "custom",
} as const;
type RetryStrategy = (typeof RetryStrategy)[keyof typeof RetryStrategy];

// 组件props定义
interface ChatUIProps {
  websocketUrl?: string;
  authToken?: string;
  encryptionKey?: string;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number; // 最大重试间隔（毫秒）
  enableExponentialBackoff?: boolean; // 是否启用指数退避
  retryStrategy?: RetryStrategy;
  customRetryDelay?: (retryCount: number) => number;
}

const ChatUI: React.FC<ChatUIProps> = ({
  websocketUrl = "wss://default-ai-api.com/chat",
  authToken = "",
  encryptionKey = "",
  maxRetries = 5, // 增加默认重试次数
  retryDelay = 2000, // 调整基础间隔
  maxRetryDelay = 10000, // 新增最大间隔
  enableExponentialBackoff = true, // 默认启用指数退避
}) => {
  // 状态管理
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uuidv4(),
      content: "您好！我是您的AI助手，可以帮您查询数据和分析问题",
      role: "ai",
      timestamp: new Date(),
      status: "sent",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
  // 重试状态管理
  const [connectionRetryCount, setConnectionRetryCount] = useState(0);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const retryTimeoutRef = useRef<number | null>(null);
  // 对话框尺寸管理
  const [currentWidth, setCurrentWidth] = useState("320px");
  const sizes = ["320px", "480px", "max(50vw, 640px)"];

  // 浮动按钮位置状态
  const [buttonPosition, setButtonPosition] = useState({
    x: window.innerWidth - 80 - 24,
    y: window.innerHeight - 40 - 24,
  });

  // 新增索引计算和按钮状态
  const currentIndex = sizes.indexOf(currentWidth);
  const isMax = currentIndex === sizes.length - 1;
  const isMin = currentIndex === 0;

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  }).current;

  // 引用管理
  const wsRef = useRef<WebSocket | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputTimerRef = useRef<number | null>(null); // 使用number类型代替NodeJS.Timeout
  const failedMessagesRef = useRef<{ [key: string]: Message }>({});

  // 添加更详细的连接状态信息
  const connectionStatus = useMemo(() => {
    if (isConnected) return "已连接";
    if (isConnecting) return "连接中";
    if (isAutoConnecting)
      return `自动重连中(${connectionRetryCount}/${maxRetries})`;
    return "已断开";
  }, [isConnected, isConnecting, isAutoConnecting, connectionRetryCount]);

  // 防抖输入处理
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (inputTimerRef.current) {
        clearTimeout(inputTimerRef.current);
      }
      inputTimerRef.current = setTimeout(() => {
        setInputValue(value);
        inputTimerRef.current = null;
      }, 300);
    },
    []
  );

  // 按钮点击处理
  const handleSizeChange = (delta: number) => {
    const newIndex = currentIndex + delta;
    if (newIndex >= 0 && newIndex < sizes.length) {
      setCurrentWidth(sizes[newIndex]);
    }
  };

  // ChatUI.tsx 在组件中添加防篡改逻辑
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" ||
            mutation.attributeName === "class")
        ) {
          // 检测到样式变化时强制重置
          const button = document.querySelector<HTMLElement>(
            ".custom-float-button"
          );
          if (
            button &&
            (button.offsetWidth !== 40 || button.offsetHeight !== 40)
          ) {
            // 强制重置大小
            button.style.width = "40px";
            button.style.height = "40px";
          }
        }
      });
    });

    const buttonElement = document.querySelector(".custom-float-button");
    if (buttonElement) {
      observer.observe(buttonElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
        subtree: false,
      });
    }

    return () => observer.disconnect();
  }, []);
  // 消息加密/解密
  const encryptMessage = useCallback(
    (message: string): string => {
      if (!encryptionKey) return message;
      return btoa(message);
    },
    [encryptionKey]
  );

  const decryptMessage = useCallback(
    (encrypted: string): string => {
      if (!encryptionKey) return encrypted;
      const decrypted = atob(encrypted);

      // 自动检测HTML内容
      if (/<[a-z][\s\S]*>/i.test(decrypted)) {
        return decrypted; // 返回原始HTML字符串供SanitizedHTML处理
      }

      return decrypted;
    },
    [encryptionKey]
  );

  // 拖拽开始事件
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault(); // 阻止默认拖拽行为
      setIsDragging(true);

      // 获取触点坐标
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      // 保存初始状态
      dragStartPos.startX = clientX;
      dragStartPos.startY = clientY;
      dragStartPos.currentX = buttonPosition.x;
      dragStartPos.currentY = buttonPosition.y;
    },
    [buttonPosition.x, buttonPosition.y]
  );

  useEffect(() => {
    // 阻止移动端双指缩放
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    window.addEventListener("touchmove", preventPinchZoom, { passive: false });
    return () => window.removeEventListener("touchmove", preventPinchZoom);
  }, []);
  // 拖拽移动事件
  const handleDragging = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      // 计算坐标偏移量
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      // 计算新的位置坐标
      const deltaX = clientX - dragStartPos.startX;
      const deltaY = clientY - dragStartPos.startY;
      const newX = dragStartPos.currentX + deltaX;
      const newY = dragStartPos.currentY + deltaY;

      // 添加边界限制
      const minX = 24;
      const minY = 24;
      const maxX = window.innerWidth - 40; // 根据按钮实际大小调整
      const maxY = window.innerHeight - 40;

      // 更新按钮位置
      setButtonPosition({
        x: Math.max(minX, Math.min(newX, maxX)),
        y: Math.max(minY, Math.min(newY, maxY)),
      });
    },
    [isDragging]
  );

  // 对话框尺寸变化时自动调整浮动按钮位置
  useEffect(() => {
    const newX = window.innerWidth - 80 - 24; // 假设按钮宽度80px
    setButtonPosition((prev) => ({ ...prev, x: newX }));
  }, [currentWidth]);

  // 拖拽结束事件
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
  }, [isDragging]);

  // 拖拽监听器
  useEffect(() => {
    window.addEventListener("mousemove", handleDragging);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragging);
    window.addEventListener("touchend", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleDragging);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragging);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [handleDragging, handleDragEnd]);

  // 窗口大小变化时调整浮动按钮
  useEffect(() => {
    const handleResize = () => {
      // 如果当前是动态尺寸（max(50vw, 640px)），强制更新 currentWidth 以触发重渲染
      if (currentWidth === sizes[2]) {
        setCurrentWidth(sizes[2]);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentWidth, sizes]);

  // 重试失败消息
  const retryFailedMessage = useCallback(
    (messageId: string) => {
      setRetryMessageId(messageId);
      const messageToRetry = failedMessagesRef.current[messageId];

      if (messageToRetry && isConnected) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  status: "sending",
                  retryCount: (msg.retryCount || 0) + 1,
                }
              : msg
          )
        );

        // 使用随机延迟防止同时重试
        const delay = Math.floor(Math.random() * 1000) + 500;

        setTimeout(() => {
          try {
            const encryptedMessage = encryptMessage(
              JSON.stringify({
                id: messageToRetry.id,
                content: messageToRetry.content,
                timestamp: messageToRetry.timestamp.toISOString(),
              })
            );

            wsRef.current?.send(encryptedMessage);
            delete failedMessagesRef.current[messageId];
            setRetryMessageId(null);
          } catch (err) {
            console.error("重试发送失败:", err);
            antMessage.error("消息重试发送失败");
            setRetryMessageId(null);
          }
        }, delay);
      }
    },
    [isConnected, encryptMessage]
  );

  // 清理函数中添加重试定时器清理
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (inputTimerRef.current) {
        clearTimeout(inputTimerRef.current);
      }
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // 失败消息处理
  const flushFailedMessages = useCallback(() => {
    Object.values(failedMessagesRef.current).forEach((message) => {
      retryFailedMessage(message.id);
    });
  }, [retryFailedMessage]);

  // 发送消息
  const sendMessage = useCallback(
    (message: Message) => {
      if (!isConnected) {
        messageQueueRef.current.push(message);
        return;
      }
      try {
        const encryptedMessage = encryptMessage(
          JSON.stringify({
            id: message.id,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
          })
        );
        wsRef.current?.send(encryptedMessage);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...msg, status: "sending" } : msg
          )
        );
      } catch (err) {
        console.error("消息发送失败:", err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...msg, status: "failed" } : msg
          )
        );
        antMessage.error("消息发送失败");
      }
    },
    [isConnected, encryptMessage]
  );

  // 消息队列处理
  const messageQueueRef = useRef<Message[]>([]);
  const flushMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0 && isConnected) {
      messageQueueRef.current.forEach((msg) => {
        sendMessage(msg);
      });
      messageQueueRef.current = [];
    }
  }, [isConnected]);

  // 处理连接重试
  const handleConnectionRetry = useCallback(() => {
    if (connectionRetryCount >= maxRetries) {
      antMessage.error(`已达最大重试次数(${maxRetries})`);
      return;
    }

    setIsAutoConnecting(true);
    const nextRetry = connectionRetryCount + 1;
    setConnectionRetryCount(nextRetry);

    // 计算带指数退避的延迟时间
    const delay = enableExponentialBackoff
      ? Math.min(retryDelay * Math.pow(2, nextRetry), maxRetryDelay)
      : retryDelay;

    retryTimeoutRef.current = setTimeout(() => {
      antMessage.info(`正在进行第${nextRetry}次重连尝试`);
      connectWebSocket();
    }, delay);
  }, [
    connectionRetryCount,
    retryDelay,
    maxRetryDelay,
    enableExponentialBackoff,
  ]);

  // WebSocket连接管理
  const connectWebSocket = useCallback(() => {
    if (isConnecting || isConnected || isAutoConnecting) return;

    setIsConnecting(true);
    setError(null);
    setShowErrorMessage(false);

    try {
      const connectUrl = authToken
        ? `${websocketUrl}?token=${encodeURIComponent(authToken)}`
        : websocketUrl;

      const ws = new WebSocket(connectUrl);
      wsRef.current = ws;

      // WebSocket打开事件
      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setIsAutoConnecting(false);
        setConnectionRetryCount(0);
        antMessage.success("已连接到AI服务器");
        flushMessageQueue();
        flushFailedMessages();
      };

      // WebSocket消息接收事件
      ws.onmessage = (event) => {
        try {
          // 使用decryptMessage解密消息
          const encryptedResponse = event.data;
          const decryptedResponse = decryptMessage(encryptedResponse); // ✅ 调用解密函数
          const parsedResponse = JSON.parse(decryptedResponse);

          // 更新消息状态
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === parsedResponse.id
                ? {
                    ...msg,
                    content: parsedResponse.content, // 使用解密后的内容
                    status: "sent",
                  }
                : msg
            )
          );
        } catch (err) {
          console.error("消息解密/处理失败:", err);
          antMessage.error("消息处理失败");
        }
      };

      // WebSocket错误事件
      ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        setError("连接异常");
        ws.close();
        handleConnectionRetry();
      };

      // WebSocket关闭事件
      ws.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);

        // 仅在非正常关闭时重试
        if (event.code !== 1000 && connectionRetryCount < maxRetries) {
          handleConnectionRetry();
        } else {
          antMessage.error("连接已断开");
          setError("连接已断开");
          setShowErrorMessage(true);
        }
      };
    } catch (err) {
      console.error("WebSocket初始化失败:", err);
      setError("连接初始化失败");
      setIsConnecting(false);
      handleConnectionRetry();
    }
  }, [websocketUrl, authToken, connectionRetryCount, decryptMessage]); // ✅ 将decryptMessage加入依赖数组

  // 处理发送消息
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !isConnected) return;

    const userMsg: Message = {
      id: uuidv4(),
      content: inputValue,
      role: "user",
      timestamp: new Date(),
      status: "sending",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    sendMessage(userMsg);
  }, [inputValue, isConnected, sendMessage]);

  // 自动连接
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (inputTimerRef.current) {
        clearTimeout(inputTimerRef.current);
      }
    };
  }, [connectWebSocket]);

  // 滚动到最新消息
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // 错误消息显示
  const ErrorMessage = useMemo(
    () => (
      <div className="error-message">
        <Alert
          message="连接异常"
          description="消息发送失败，您可以点击重试或检查网络连接"
          type="error"
          showIcon
          action={
            <Button size="small" onClick={connectWebSocket}>
              重试连接
            </Button>
          }
        />
      </div>
    ),
    [connectWebSocket]
  );

  return (
    <div className="chat-ui-container">
      {/* 可拖动的浮动按钮 */}
      <div
        className="draggable-button"
        style={{
          position: "fixed",
          left: `${buttonPosition.x}px`,
          top: `${buttonPosition.y}px`,
          cursor: "move",
          zIndex: 9998,
        }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <FloatButton
          onClick={() => setIsExpanded(!isExpanded)}
          isConnected={isConnected}
          isDragging={isDragging}
          style={{
            position: "fixed",
            left: `${buttonPosition.x}px`,
            top: `${buttonPosition.y}px`,
            zIndex: 9998,
            right: 0,
          }}
        />
      </div>

      {/* 固定右侧的对话框 */}
      {isExpanded && (
        <div
          className="chat-window"
          style={{
            position: "fixed",
            right: "0",
            top: "0",
            bottom: "0",
            width: currentWidth,
            height: "100vh",
            transition: isDragging ? "none" : "all 0.2s ease",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxSizing: "border-box", // 防止 padding 影响宽度计算
            minWidth: "320px", // 防止宽度过小
          }}
        >
          <div className="chat-header">
            <Space>
              <RobotOutlined /> AI助手
            </Space>
            <Tooltip title="增大">
              <Button
                icon={<DoubleLeftOutlined />}
                onClick={() => handleSizeChange(1)}
                disabled={isMax}
                style={{ marginLeft: 8 }}
              />
            </Tooltip>
            <Tooltip title="缩小">
              <Button
                icon={<DoubleRightOutlined />}
                onClick={() => handleSizeChange(-1)}
                disabled={isMin}
              />
            </Tooltip>
            <StatusDisplay status={connectionStatus} error={error} />
            <Tooltip title="关闭">
              <CloseOutlined
                style={{ marginLeft: "auto", cursor: "pointer" }}
                onClick={() => setIsExpanded(false)}
              />
            </Tooltip>
          </div>

          <div className="message-list-container" ref={messageListRef}>
            {showErrorMessage && ErrorMessage}
            <List
              className="message-list"
              dataSource={messages}
              renderItem={(msg) => (
                <List.Item
                  className={`message-item ${msg.role} ${msg.status}`}
                  key={msg.id}
                >
                  <div className="message-content">
                    <SanitizedHTML
                      html={msg.content}
                      className="sanitized-content"
                      tagName="div"
                    />
                    {msg.status === "sending" && (
                      <Spin
                        size="small"
                        style={{ marginLeft: 8 }}
                        indicator={<ClockCircleOutlined />}
                      />
                    )}
                    {msg.status === "failed" && (
                      <Popconfirm
                        title="消息发送失败"
                        description="是否重试发送此消息？"
                        onConfirm={() => retryFailedMessage(msg.id)}
                        okText="重试"
                        cancelText="取消"
                      >
                        <WarningOutlined
                          style={{
                            marginLeft: 8,
                            color: "#ff4d4f",
                            cursor: "pointer",
                          }}
                          spin={retryMessageId === msg.id}
                        />
                      </Popconfirm>
                    )}
                  </div>
                  <div className="message-time">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </List.Item>
              )}
            />
          </div>

          <div className="input-area">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onPressEnter={handleSend}
              placeholder={isConnected ? "输入问题..." : "当前离线"}
              disabled={!isConnected}
              suffix={
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  disabled={!isConnected || !inputValue.trim()}
                  loading={isConnecting}
                />
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatUI;
