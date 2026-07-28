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

export interface EditorState {
  tool: Tool;
  color: string;
  lineWidth: number;
  fontSize: number;
  emoji: string;
  undoStack: ImageData[];
  redoStack: ImageData[];
}

export interface Point {
  x: number;
  y: number;
}

export interface EditorController {
  setTool(tool: Tool): void;
  setColor(color: string): void;
  setLineWidth(width: number): void;
  setFontSize(size: number): void;
  setEmoji(emoji: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getImageBlob(): Promise<Blob>;
  getImageBase64(): string;
  destroy(): void;
  onStateChange?: (state: { canUndo: boolean; canRedo: boolean; tool: Tool }) => void;
}

export interface EditorOptions {
  imageUrl?: string;
  imageData?: ImageData;
  imageBase64?: string;
  onSave?: (blob: Blob) => void;
  onCancel?: () => void;
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
