// components/StatusDisplay/index.tsx
import React, { useMemo } from "react";
import { WarningOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import styles from "./index.module.css";

type StatusType = "connected" | "connecting" | "reconnecting" | "disconnected";
interface StatusConfigItem {
  color: string;
  icon: React.ReactNode | null;
  text: string;
}
type StatusConfig = {
  [key in StatusType]: StatusConfigItem;
};

const defaultStatusConfig: StatusConfig = {
  connected: {
    color: "#52c41a",
    icon: null,
    text: "已连接",
  },
  connecting: {
    color: "#faad14",
    icon: <Spin size="small" />,
    text: "连接中",
  },
  reconnecting: {
    color: "#faad14",
    icon: <Spin size="small" />,
    text: "自动重连中",
  },
  disconnected: {
    color: "#ff4d4f",
    icon: null,
    text: "已断开",
  },
};

interface StatusDisplayProps {
  status: string;
  error?: string | null;
  customConfig?: Partial<Record<StatusType, StatusConfig[StatusType]>>;
  showIcon?: boolean;
  compact?: boolean;
  className?: string;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({
  status,
  error,
  customConfig = {},
  showIcon = true,
  compact = false,
  className = "",
}) => {
  // 合并自定义配置
  const mergedConfig = useMemo(
    () => ({
      ...defaultStatusConfig,
      ...customConfig,
    }),
    [customConfig]
  );

  // 确定状态类型
  const statusType = useMemo(() => {
    if (status.includes("已连接")) return "connected";
    if (status.includes("连接中")) return "connecting";
    if (status.includes("自动重连")) return "reconnecting";
    return "disconnected";
  }, [status]);

  // 获取当前状态配置
  const currentConfig = mergedConfig[statusType];
  const { color, icon, text } = currentConfig;

  // 错误状态优先显示
  if (error) {
    return (
      <span
        className={`${styles.statusDisplay} ${styles.error} ${className}`}
        role="alert"
        aria-label="错误状态"
        aria-live="assertive"
      >
        {showIcon && <WarningOutlined className={styles.icon} />}
        {compact ? "错误" : error}
      </span>
    );
  }

  return (
    <span
      className={`${styles.statusDisplay} ${styles[statusType]} ${className}`}
      style={{ color }}
      role="status"
      aria-label={`${text}状态`}
    >
      {showIcon && icon && <span className={styles.icon}>{icon}</span>}
      {text}
      {statusType === "reconnecting" && (
        <span className={styles.reconnectCount}>
          {status.split("(")[1] ? `(${status.split("(")[1]}` : ""}
        </span>
      )}
    </span>
  );
};

export default StatusDisplay;
