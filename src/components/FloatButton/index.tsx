// components/CustomFloatButton.tsx
import React from "react";
import { RobotOutlined } from "@ant-design/icons";
import "./index.module.css";

interface CustomFloatButtonProps {
  onClick?: () => void;
  isConnected?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

const CustomFloatButton: React.FC<CustomFloatButtonProps> = ({
  onClick,
  isConnected = false,
  isDragging = false,
  style = {},
}) => {
  return (
    <div
      className={`custom-float-button ${isDragging ? "dragging" : ""}`}
      style={{
        ...style,
        transition: isDragging ? "none" : "all 0.2s ease",
        boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
      }}
      onClick={onClick}
    >
      <div className="button-content">
        <RobotOutlined style={{ fontSize: "16px" }} />
        <div className={`status-dot ${isConnected ? "active" : "inactive"}`} />
      </div>
    </div>
  );
};

export default CustomFloatButton;
