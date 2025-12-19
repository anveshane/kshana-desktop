import styles from './StatusBar.module.scss';

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'error';

export interface StatusBarProps {
    agentName?: string;
    status: AgentStatus;
    message?: string;
}

export default function StatusBar({ agentName, status, message }: StatusBarProps) {
    const getStatusClass = () => {
        switch (status) {
            case 'idle':
                return styles.ready;
            case 'thinking':
            case 'executing':
                return styles.thinking;
            case 'waiting':
                return styles.ready; // Waiting for user is considered a "ready" state for interaction
            case 'completed':
                return styles.completed;
            case 'error':
                return styles.error;
            default:
                return styles.ready;
        }
    };

    const getStatusText = () => {
        if (message) return message;

        switch (status) {
            case 'idle':
                return 'Ready';
            case 'thinking':
                return 'Thinking...';
            case 'executing':
                return 'Executing tool...';
            case 'waiting':
                return 'Waiting for input...';
            case 'completed':
                return 'Task completed';
            case 'error':
                return 'Error';
            default:
                return 'Ready';
        }
    };

    return (
        <div className={styles.container}>
            <div className={`${styles.statusIndicator} ${getStatusClass()}`} />
            {agentName && <span className={styles.agentName}>[{agentName}]</span>}
            <span className={styles.statusText}>{getStatusText()}</span>
        </div>
    );
}
