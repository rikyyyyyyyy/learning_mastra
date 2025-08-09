"use client";

import { useState } from "react";
import { Database, X, ListTodo, MessageSquareMore } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TaskViewer } from "./task-viewer";
import { DirectiveViewer } from "./directive-viewer";

interface DBViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkId?: string;
}

type ViewType = 'tasks' | 'directives';

export function DBViewerDialog({ open, onOpenChange, networkId }: DBViewerDialogProps) {
  const [viewType, setViewType] = useState<ViewType>('tasks');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-background">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              データベースビューア
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewType === 'tasks' ? 'default' : 'outline'}
            onClick={() => setViewType('tasks')}
            className="flex items-center gap-2"
          >
            <ListTodo className="w-4 h-4" />
            タスク管理
          </Button>
          <Button
            variant={viewType === 'directives' ? 'default' : 'outline'}
            onClick={() => setViewType('directives')}
            className="flex items-center gap-2"
          >
            <MessageSquareMore className="w-4 h-4" />
            追加指令
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {viewType === 'tasks' ? (
            <TaskViewer networkId={networkId} />
          ) : (
            <DirectiveViewer networkId={networkId} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}