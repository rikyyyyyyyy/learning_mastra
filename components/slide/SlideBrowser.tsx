"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fit the loaded slide into the preview box (scale inside iframe)
  const fitSlide = () => {
    const iframe = iframeRef.current;
    const parent = iframe?.parentElement as HTMLElement | null;
    const doc = iframe?.contentDocument as Document | null;
    if (!iframe || !parent || !doc) return;
    const html = doc.documentElement as HTMLElement;
    const body = doc.body as HTMLElement;

    html.style.width = '100%';
    html.style.height = '100%';
    html.style.margin = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.style.position = 'relative';

    let wrapper = doc.getElementById('slide-fit-wrapper') as HTMLElement | null;
    if (!wrapper) {
      wrapper = doc.createElement('div');
      wrapper.id = 'slide-fit-wrapper';
      while (body.firstChild) wrapper.appendChild(body.firstChild);
      body.appendChild(wrapper);
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.willChange = 'transform';
      wrapper.style.position = 'absolute';
      wrapper.style.top = '0';
      wrapper.style.left = '0';
      const naturalWidth = Math.max(wrapper.scrollWidth, wrapper.offsetWidth, 1);
      const naturalHeight = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 1);
      wrapper.dataset.naturalWidth = String(naturalWidth);
      wrapper.dataset.naturalHeight = String(naturalHeight);
      wrapper.style.width = naturalWidth + 'px';
      wrapper.style.height = naturalHeight + 'px';
    }

    const naturalWidth = Number(wrapper.dataset.naturalWidth || Math.max(wrapper.scrollWidth, wrapper.offsetWidth, 1));
    const naturalHeight = Number(wrapper.dataset.naturalHeight || Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 1));

    const availWidth = parent.clientWidth;
    const availHeight = parent.clientHeight;
    const scale = Math.min(availWidth / naturalWidth, availHeight / naturalHeight, 1);
    const offsetX = Math.max(0, (availWidth - naturalWidth * scale) / 2);
    const offsetY = Math.max(0, (availHeight - naturalHeight * scale) / 2);
    wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };

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

  // Refit when the dialog is open and selection or size changes
  useEffect(() => {
    if (!open) return;
    const parent = iframeRef.current?.parentElement;
    const ro = new ResizeObserver(() => fitSlide());
    if (parent) ro.observe(parent);
    const onResize = () => fitSlide();
    window.addEventListener('resize', onResize);
    // observe content wrapper inside iframe as well
    const doc = iframeRef.current?.contentDocument || null;
    let roContent: ResizeObserver | null = null;
    const wrapper = doc?.getElementById('slide-fit-wrapper');
    if (wrapper) {
      roContent = new ResizeObserver(() => fitSlide());
      roContent.observe(wrapper);
    }
    return () => {
      ro.disconnect();
      roContent?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [open, selected]);

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
                ref={iframeRef}
                src={`/api/slides/${encodeURIComponent(selected.name)}`}
                title={selected.name}
                className="w-full h-full"
                style={{ border: 'none' }}
                onLoad={fitSlide}
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
