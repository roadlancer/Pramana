export type Tool =
  | 'select'
  | 'highlight'
  | 'draw'
  | 'text'
  | 'arrow'
  | 'rectangle'
  | 'blur'
  | 'emoji'
  | 'eraser';

export const TOOLS: Tool[] = ['select', 'highlight', 'draw', 'text', 'arrow', 'rectangle', 'blur', 'emoji', 'eraser'];

export const DEFAULT_TOOL: Tool = 'highlight';

export interface Point {
  x: number;
  y: number;
}

// Annotations are kept as data and re-rendered, so they can be selected, moved and deleted
export type EditorElement =
  | { id: number; type: 'highlight' | 'rectangle' | 'blur'; x: number; y: number; width: number; height: number; color: string; lineWidth: number }
  | { id: number; type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number }
  | { id: number; type: 'draw'; points: Point[]; color: string; lineWidth: number }
  | { id: number; type: 'text'; x: number; y: number; width: number; height: number; text: string; color: string; fontSize: number }
  | { id: number; type: 'emoji'; x: number; y: number; width: number; height: number; emoji: string; fontSize: number };

export interface EditorController {
  setTool(tool: Tool): void;
  getTool(): Tool;
  getElements(): EditorElement[];
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getImageBlob(): Promise<Blob>;
  /** Copies the image with its annotations to the clipboard */
  copy(): Promise<void>;
  save(): Promise<void>;
  destroy(): void;
}

export interface EditorOptions {
  imageBase64: string;
  title?: string;
  /** Receives the flattened PNG; a rejected promise re-enables the Save button. */
  onSave: (blob: Blob) => Promise<void> | void;
  onCancel: () => void;
  cancelLabel?: string;
}

export const DEFAULT_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
  '#FFFFFF', '#000000', '#8E8E93', '#F2F2F7',
];

export const EMOJI_LIST = [
  '🔥', '⭐', '✅', '❌', '⚠️', '💡', '🚀', '🐛',
  '📌', '🎯', '💪', '👍', '👎', '❓', '❗', '🆕',
  '🔴', '🟡', '🟢', '🔵', '💬', '📝', '🔗', '📁',
];
