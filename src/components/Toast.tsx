import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    details?: { id: number | string; title: string };
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, details, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleClose();
        }, 4000);
        return () => clearTimeout(timer);
    }, [message, type]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => {
            onClose();
        }, 300); // Wait for the 300ms fadeOut CSS animation
    };

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle size={18} color="#2ecc71" style={{ flexShrink: 0 }} />;
            case 'error':
                return <AlertCircle size={18} color="var(--primary)" style={{ flexShrink: 0 }} />;
            case 'info':
            default:
                return <Info size={18} color="#3498db" style={{ flexShrink: 0 }} />;
        }
    };

    return (
        <div className={`toast-container ${type} ${isExiting ? 'exit' : ''}`}>
            {getIcon()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexGrow: 1, minWidth: 0 }}>
                {details && (
                    <div style={{ 
                        fontSize: '11px', 
                        fontWeight: 700, 
                        color: 'var(--text-muted)', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.5px',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                    }}>
                        [{details.id}] {details.title}
                    </div>
                )}
                <span className="toast-message">{message}</span>
            </div>
            <button className="toast-close-btn" onClick={handleClose}>
                <X size={14} />
            </button>
        </div>
    );
};
