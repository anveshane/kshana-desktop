import React from 'react';
import styles from './ErrorMessage.module.scss';

interface ErrorMessageProps {
    title?: string;
    message: string;
    details?: string[];
    troubleshooting?: string[];
}

export default function ErrorMessage({
    title = 'An error occurred',
    message,
    details = [],
    troubleshooting = [],
}: ErrorMessageProps) {
    return (
        <div className={styles.error}>
            <div className={styles.errorIcon}>⚠️</div>
            <h3 className={styles.errorTitle}>{title}</h3>
            <p className={styles.errorMessage}>{message}</p>

            {details.length > 0 && (
                <div className={styles.errorDetails}>
                    {details.map((line, index) => (
                        <p key={index} className={styles.errorDetail}>
                            {line}
                        </p>
                    ))}
                </div>
            )}

            {troubleshooting.length > 0 && (
                <div className={styles.troubleshootingSection}>
                    {troubleshooting.map((line, index) => {
                        const isHeading = index === 0 && !line.startsWith('•');
                        return (
                            <p
                                key={index}
                                className={isHeading ? styles.errorTroubleshooting : styles.errorTroubleshooting}
                                style={!isHeading ? { paddingLeft: '12px' } : undefined}
                            >
                                {line}
                            </p>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
