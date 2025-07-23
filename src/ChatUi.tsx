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
  FloatButton,
  Space,
  message,
  Spin,
  Popconfirm,
  Alert,
} from "antd";
import {
  RobotOutlined,
  SendOutlined,
  ReloadOutlined,
  CloseOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import "./index.css";
import DOMPurify from "dompurify";
import { v4 as uuidv4 } from "uuid";

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

// 组件props定义
interface ChatUIProps {
  websocketUrl?: string;
  authToken?: string;
  encryptionKey?: string;
  maxRetries?: number;
  retryDelay?: number;
}

const ChatUI: React.FC<ChatUIProps> = ({
  websocketUrl = "wss://default-ai-api.com/chat",
  authToken = "",
  encryptionKey = "",
  maxRetries = 3,
  retryDelay = 3000,
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

  // 对话框尺寸管理
  const [currentWidth, setCurrentWidth] = useState("320px");
  const sizes = ["320px", "480px", "50vw"];

  // 浮动按钮位置状态
  const [buttonPosition, setButtonPosition] = useState({
    x: window.innerWidth - 80 - 24,
    y: window.innerHeight - 40 - 24,
  });

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
  const inputTimerRef = useRef<NodeJS.Timeout | null>(null);
  const failedMessagesRef = useRef<{ [key: string]: Message }>({});

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
      return atob(encrypted);
    },
    [encryptionKey]
  );

  // 拖拽开始事件
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      dragStartPos.startX = clientX;
      dragStartPos.startY = clientY;
      dragStartPos.currentX = buttonPosition.x;
      dragStartPos.currentY = buttonPosition.y;
    },
    [buttonPosition.x, buttonPosition.y]
  );

  // 拖拽移动事件
  const handleDragging = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - dragStartPos.startX;
      const deltaY = clientY - dragStartPos.startY;

      const newX = dragStartPos.currentX + deltaX;
      const newY = dragStartPos.currentY + deltaY;

      const minX = 24;
      const minY = 24;
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 40;

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
      setButtonPosition((prev) => {
        const newX = Math.max(24, Math.min(prev.x, window.innerWidth - 80));
        const newY = Math.max(24, Math.min(prev.y, window.innerHeight - 40));
        return { x: newX, y: newY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 切换尺寸
  const handleToggleSize = useCallback(() => {
    const currentIndex = sizes.indexOf(currentWidth);
    const nextIndex = (currentIndex + 1) % sizes.length;
    setCurrentWidth(sizes[nextIndex]);
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
          message.error("消息重试发送失败");
          setRetryMessageId(null);
        }
      }
    },
    [isConnected, encryptMessage]
  );

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
        message.error("消息发送失败");
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

  // WebSocket连接管理
  const connectWebSocket = useCallback(() => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    setError(null);
    setShowErrorMessage(false);
    try {
      const connectUrl = authToken
        ? `${websocketUrl}?token=${encodeURIComponent(authToken)}`
        : websocketUrl;
      const ws = new WebSocket(connectUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        message.success("已连接到AI服务器");
        flushMessageQueue();
        flushFailedMessages();
      };
      ws.onmessage = (event) => {
        try {
          const encryptedData = event.data;
          const decryptedData = decryptMessage(encryptedData);
          const data = JSON.parse(decryptedData);
          if (data.content) {
            setMessages((prev) => [
              ...prev,
              {
                id: uuidv4(),
                content: DOMPurify.sanitize(data.content),
                role: "ai",
                timestamp: new Date(),
                status: "sent",
              },
            ]);
          }
        } catch (err) {
          console.error("消息处理失败:", err);
        }
      };
      ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        setError("连接异常");
        ws.close();
      };
      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        message.error("连接已断开，请检查网络");
        setError("连接已断开");
        setShowErrorMessage(true);
      };
    } catch (err) {
      console.error("WebSocket初始化失败:", err);
      setError("连接初始化失败");
      setIsConnecting(false);
      setShowErrorMessage(true);
    }
  }, [
    websocketUrl,
    authToken,
    decryptMessage,
    flushFailedMessages,
    flushMessageQueue,
  ]);

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
          icon={
            <div style={{ position: "relative" }}>
              <RobotOutlined />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isConnected ? "#52c41a" : "#ff4d4f",
                  boxShadow: "0 0 4px rgba(0,0,0,0.3)",
                }}
              />
            </div>
          }
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ right: 0 }}
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
          }}
        >
          <div className="chat-header">
            <Space>
              <RobotOutlined /> AI助手
            </Space>
            <Tooltip title="切换尺寸">
              <ReloadOutlined onClick={handleToggleSize} />
            </Tooltip>
            {isConnecting && (
              <span style={{ fontSize: 12, color: "#faad14" }}>
                <Spin size="small" style={{ marginRight: 8 }} />
                连接中...
              </span>
            )}
            {error && (
              <span style={{ fontSize: 12, color: "#ff4d4f" }}>
                <WarningOutlined /> {error}
              </span>
            )}
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
                    {msg.content}
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
