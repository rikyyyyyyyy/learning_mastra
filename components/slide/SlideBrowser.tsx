"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SlideFile = { name: string; size: number; mtime: number };

export default function SlideBrowser() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SlideFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SlideFile | null>(null);

  const formatted = useMemo(
    () =>
      files.map((f) => ({
        ...f,
        date: new Date(f.mtime).toLocaleString(),
      })),
    [files],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/slides");
        const json = await res.json();
        if (!cancelled) setFiles(json.files ?? []);
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">保存済みファイルを開く</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>保存済みスライド</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="max-h-[60vh] overflow-auto rounded-xl border p-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">読み込み中...</div>
            ) : formatted.length === 0 ? (
              <div className="text-sm text-muted-foreground">ファイルがありません</div>
            ) : (
              <ul className="space-y-2">
                {formatted.map((f) => (
                  <li key={f.name}>
                    <button
                      className={`w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition ${
                        selected?.name === f.name ? "bg-accent" : "bg-background"
                      }`}
                      onClick={() => setSelected(f)}
                    >
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.date}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="h-[60vh] rounded-xl border overflow-hidden bg-muted/20">
            {selected ? (
              <iframe
                key={selected.name}
                src={`/api/slides/${encodeURIComponent(selected.name)}`}
                title={selected.name}
                className="w-full h-full"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                スライドを選択してください
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

