import styles from './TodoDisplay.module.scss';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TodoItem {
  id?: string;
  task?: string;
  content?: string;
  status?: TodoStatus;
  depth?: number;
  hasSubtasks?: boolean;
  parentId?: string;
}

export interface TodoDisplayProps {
  todos: TodoItem[];
  compact?: boolean;
}

const STATUS_ICONS: Record<TodoStatus, { icon: string; className: string }> = {
  pending: { icon: '○', className: styles.statusPending },
  in_progress: { icon: '●', className: styles.statusInProgress },
  completed: { icon: '✓', className: styles.statusCompleted },
  cancelled: { icon: '✗', className: styles.statusCancelled },
};

function TodoItem({ todo, index, compact }: { todo: TodoItem; index: number; compact?: boolean }) {
  const status = (todo.status || 'pending') as TodoStatus;
  const statusConfig = STATUS_ICONS[status];
  const indent = todo.depth || 0;
  const content = todo.task || todo.content || 'Task';

  if (compact) {
    return (
      <div className={styles.todoItem}>
        <span className={statusConfig.className}>{statusConfig.icon}</span>
        <span className={status === 'pending' ? styles.todoContentDimmed : styles.todoContent}>
          {' '}
          {content}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.todoItem}>
      <span className={styles.todoIndex}>{String(index + 1).padStart(2, ' ')}.</span>
      <span className={styles.todoIndent}>{'  '.repeat(indent)}</span>
      <span className={statusConfig.className}>{statusConfig.icon}</span>
      <span
        className={
          status === 'pending' || status === 'cancelled' ? styles.todoContentDimmed : styles.todoContent
        }
      >
        {' '}
        {content}
      </span>
    </div>
  );
}

export default function TodoDisplay({ todos, compact = false }: TodoDisplayProps) {
  const visibleTodos = todos.filter((t) => t.task || t.content);

  if (visibleTodos.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>No todos</div>
      </div>
    );
  }

  const completedCount = visibleTodos.filter((t) => t.status === 'completed').length;
  const pendingCount = visibleTodos.filter((t) => t.status === 'pending').length;
  const inProgressCount = visibleTodos.filter((t) => t.status === 'in_progress').length;
  const currentTask = visibleTodos.find((t) => t.status === 'in_progress');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>📋</span>
        <span className={styles.headerText}>
          Todos ({completedCount}/{visibleTodos.length})
        </span>
        {inProgressCount > 0 && (
          <span className={styles.headerInProgress}> • {inProgressCount} in progress</span>
        )}
        {pendingCount > 0 && (
          <span className={styles.headerPending}> • {pendingCount} pending</span>
        )}
      </div>
      {!compact && currentTask && (
        <div className={styles.currentTask}>
          Working on: {currentTask.task || currentTask.content}
        </div>
      )}
      <div className={styles.todoList}>
        {visibleTodos.map((todo, i) => (
          <TodoItem key={todo.id || i} todo={todo} index={i} compact={compact} />
        ))}
      </div>
    </div>
  );
}

