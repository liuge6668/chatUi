export class MockWebSocket {
  private static instance: MockWebSocket;
  private messageListeners: Map<string, (data: any) => void> = new Map();
  private responseListeners: Map<
    string,
    (data: any, respond: (response: any) => void) => void
  > = new Map();

  public isConnected = true;
  private clientId = Math.random().toString(36).substring(2, 15);
  private responseDelay = 500; // 模拟网络延迟
  private isConnecting = false; // 新增的属性声明
  private retryCount = 0;
  private maxRetries = 3;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private constructor() {
    console.log("MockWebSocket initialized (Client ID:", this.clientId, ")");

    // 初始化连接状态为false，避免初始状态误导
    this.isConnected = false;

    // 模拟连接建立过程
    setTimeout(() => {
      this.isConnected = true;
      // 触发onOpen回调
      this.onOpen(() => {
        // 模拟初始连接成功消息
        this.simulateServerResponse({
          type: "connect",
          clientId: this.clientId,
          status: "success",
        });
      });
    }, this.responseDelay);
  }

  public static getInstance(): MockWebSocket {
    if (!MockWebSocket.instance) {
      MockWebSocket.instance = new MockWebSocket();
    }
    return MockWebSocket.instance;
  }

  public onMessage(callback: (data: any) => void): void {
    this.messageListeners.forEach((_, key) => {
      if (key.startsWith("message-")) {
        this.messageListeners.delete(key);
      }
    });
    this.messageListeners.set(`message-${Date.now()}`, callback);
  }

  public onOpen(callback?: () => void): void {
    console.debug("[MockWebSocket] onOpen called");
    this.isConnected = true;
    callback?.();
    console.debug("[MockWebSocket] New state: connected");
  }

  public onError(callback?: (error: any) => void): void {
    // 模拟随机错误
    if (Math.random() < 0.1) {
      // 10% 错误概率
      setTimeout(() => {
        callback?.(new Error("Mocked connection error"));
      }, this.responseDelay);
    }
  }

  public onClose(callback?: () => void): void {
    console.debug("[MockWebSocket] onClose called");
    if (this.isConnected) {
      setTimeout(() => {
        this.isConnected = false;
        callback?.();
        console.debug("[MockWebSocket] New state: disconnected");
      }, this.responseDelay);
    }
  }

  public send(data: string): void {
    try {
      const parsedData = JSON.parse(data);
      console.log("Client -> Server:", parsedData);

      // 模拟服务器响应
      setTimeout(() => {
        this.simulateServerResponse({
          type: "response",
          originalRequest: parsedData,
          timestamp: new Date().toISOString(),
        });
      }, this.responseDelay);
    } catch (error) {
      console.error("MockWebSocket: Invalid JSON format", error);
    }
  }

  public connect(): void {
    if (this.isConnected || this.isConnecting) return;

    this.isConnecting = true;
    this.retryCount = 0;

    this.attemptConnect();
  }

  private attemptConnect(): void {
    setTimeout(() => {
      if (this.retryCount < this.maxRetries) {
        // 模拟连接成功
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.onOpen();
      } else {
        console.error("连接失败超过最大重试次数");
        this.handleConnectionFailure();
      }
    }, this.responseDelay * (this.retryCount + 1));
  }

  private handleConnectionFailure(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.retryCount = 0;
        this.attemptConnect();
      }, this.responseDelay * 2 * this.reconnectAttempts);
    }
  }

  public close(): void {
    this.isConnected = false;
    this.isConnecting = false;
    this.simulateServerResponse({
      type: "disconnect",
      clientId: this.clientId,
    });
    // 自动触发重连
    this.handleConnectionFailure();
  }

  // 注册自定义响应处理器
  public registerResponseHandler(
    handler: (data: any, respond: (response: any) => void) => void
  ): void {
    this.responseListeners.set(`handler-${Date.now()}`, handler);
  }

  // 模拟服务器响应
  private simulateServerResponse(response: any): void {
    if (!this.isConnected) return;

    // 模拟随机消息丢失
    if (Math.random() < 0.05) {
      // 5% 消息丢失
      console.log("MockWebSocket: Message dropped (5% loss)");
      return;
    }

    // 模拟服务器处理
    const message = {
      ...response,
      mockTimestamp: new Date().toISOString(),
      from: "mock-server",
    };

    console.log("Server -> Client:", message);

    // 触发消息处理
    this.messageListeners.forEach((listener) => {
      if (typeof listener === "function") {
        listener(message);
      }
    });

    // 触发响应处理
    this.responseListeners.forEach((listener) => {
      if (typeof listener === "function") {
        const respond = (response: any) => {
          console.log("Responding with:", response);
          // 这里可以添加实际的响应处理逻辑
        };
        listener(message, respond);
      }
    });
  }

  // 模拟随机延迟
  private randomDelay(min = 200, max = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 模拟认证消息
  public sendAuthMessage(token: string): void {
    setTimeout(() => {
      this.simulateServerResponse({
        type: "auth",
        status: "success",
        token: `mocked_${token}`,
      });
    }, this.randomDelay());
  }

  // 模拟实时消息
  public simulateRealTimeUpdate(): void {
    setInterval(() => {
      if (this.isConnected) {
        this.simulateServerResponse({
          type: "realtime",
          data: `Update ${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
      }
    }, 5000);
  }

  // 模拟消息历史
  public fetchMockHistory(): Promise<any[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: 1,
            text: "历史消息1",
            timestamp: new Date(Date.now() - 3600000),
          },
          {
            id: 2,
            text: "历史消息2",
            timestamp: new Date(Date.now() - 1800000),
          },
        ]);
      }, this.responseDelay);
    });
  }
}
