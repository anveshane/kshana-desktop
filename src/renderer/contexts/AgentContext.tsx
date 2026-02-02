/**
 * AgentContext - Allows components to trigger agent tasks (e.g. "Generate infographics")
 * without going through the chat input. ChatPanel registers its sendMessage as the implementation.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from 'react';

type SendTaskFn = (task: string) => Promise<void>;

interface AgentContextValue {
  sendTask: (task: string) => Promise<void>;
  registerSendTask: (fn: SendTaskFn) => () => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const sendTaskRef = useRef<SendTaskFn | null>(null);

  const registerSendTask = useCallback((fn: SendTaskFn) => {
    sendTaskRef.current = fn;
    return () => {
      sendTaskRef.current = null;
    };
  }, []);

  const sendTask = useCallback(async (task: string) => {
    if (sendTaskRef.current) {
      await sendTaskRef.current(task);
    } else {
      console.warn('[AgentContext] No sendTask registered (ChatPanel may not be mounted)');
    }
  }, []);

  const value: AgentContextValue = { sendTask, registerSendTask };
  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue | null {
  return useContext(AgentContext);
}
