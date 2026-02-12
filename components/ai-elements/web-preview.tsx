"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, Monitor, Smartphone, Tablet, RotateCcw, ExternalLink, Terminal, Globe, Sparkles, Trash2, Copy, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ComponentProps, ReactNode } from "react";
import React, { createContext, useContext, useEffect, useState, forwardRef, useImperativeHandle, useRef, useMemo } from "react";
import { Console as ConsoleFeed } from "console-feed";
import type { Message as ConsoleFeedMessage } from "console-feed/lib/definitions/Component";

export type DevicePreset = {
  name: string;
  width: number;
  height: number;
  type: "mobile" | "tablet";
  icon: ReactNode;
};

export const DEVICE_PRESETS: DevicePreset[] = [
  // Mobile
  { name: "iPhone SE", width: 375, height: 667, type: "mobile", icon: <Smartphone className="h-4 w-4" /> },
  { name: "iPhone 12/13", width: 390, height: 844, type: "mobile", icon: <Smartphone className="h-4 w-4" /> },
  { name: "iPhone 12 Pro Max", width: 428, height: 926, type: "mobile", icon: <Smartphone className="h-4 w-4" /> },
  { name: "Samsung Galaxy S20", width: 360, height: 640, type: "mobile", icon: <Smartphone className="h-4 w-4" /> },
  { name: "Pixel 5", width: 393, height: 851, type: "mobile", icon: <Smartphone className="h-4 w-4" /> },

  // Tablet
  { name: "iPad", width: 768, height: 1024, type: "tablet", icon: <Tablet className="h-4 w-4" /> },
  { name: "iPad Pro", width: 1024, height: 1366, type: "tablet", icon: <Tablet className="h-4 w-4" /> },
  { name: "Surface Pro 7", width: 912, height: 1368, type: "tablet", icon: <Tablet className="h-4 w-4" /> },
];

export type WebPreviewContextValue = {
  url: string;
  setUrl: (url: string) => void;
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean) => void;
  device: DevicePreset | null;
  setDevice: (device: DevicePreset | null) => void;
};

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

const useWebPreview = () => {
  const context = useContext(WebPreviewContext);
  if (!context) {
    throw new Error("WebPreview components must be used within a WebPreview");
  }
  return context;
};

export type WebPreviewProps = ComponentProps<"div"> & {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
  defaultDevice?: DevicePreset | null;
  onDeviceChange?: (device: DevicePreset | null) => void;
};

export const WebPreview = ({
  className,
  children,
  defaultUrl = "",
  onUrlChange,
  defaultDevice = null,
  onDeviceChange,
  ...props
}: WebPreviewProps) => {
  const [url, setUrl] = useState(defaultUrl);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [device, setDevice] = useState<DevicePreset | null>(defaultDevice);

  // Sync URL state when defaultUrl changes
  useEffect(() => {
    setUrl(defaultUrl);
  }, [defaultUrl]);

  // Sync device state when defaultDevice changes
  useEffect(() => {
    setDevice(defaultDevice);
  }, [defaultDevice]);

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    onUrlChange?.(newUrl);
  };

  const handleDeviceChange = (newDevice: DevicePreset | null) => {
    setDevice(newDevice);
    onDeviceChange?.(newDevice);
  };

  const contextValue: WebPreviewContextValue = {
    url,
    setUrl: handleUrlChange,
    consoleOpen,
    setConsoleOpen,
    device,
    setDevice: handleDeviceChange,
  };

  return (
    <WebPreviewContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex size-full flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
};

export type WebPreviewNavigationProps = ComponentProps<"div">;

export const WebPreviewNavigation = ({
  className,
  children,
  ...props
}: WebPreviewNavigationProps) => (
  <div
    className={cn("flex items-center gap-1 border-b p-2", className)}
    {...props}
  >
    {children}
  </div>
);

export type WebPreviewNavigationButtonProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

export const WebPreviewNavigationButton = ({
  onClick,
  disabled,
  tooltip,
  children,
  ...props
}: WebPreviewNavigationButtonProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 w-8 p-0 text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
          disabled={disabled}
          onClick={onClick}
          size="sm"
          variant="ghost"
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export type WebPreviewUrlProps = ComponentProps<typeof Input> & {
  onRefresh?: () => void;
  onOpenExternal?: () => void;
  refreshDisabled?: boolean;
  externalDisabled?: boolean;
};

export const WebPreviewUrl = ({
  value,
  onChange,
  onKeyDown,
  onRefresh,
  onOpenExternal,
  refreshDisabled = false,
  externalDisabled = false,
  ...props
}: WebPreviewUrlProps) => {
  const { url, setUrl } = useWebPreview();
  const [inputValue, setInputValue] = useState(url);

  // Sync input value with context URL when it changes externally
  useEffect(() => {
    setInputValue(url);
  }, [url]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    onChange?.(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const target = event.target as HTMLInputElement;
      setUrl(target.value);
    }
    onKeyDown?.(event);
  };

  return (
    <div className="flex items-center h-8 flex-1 relative">
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 mr-1 text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
          onClick={onRefresh}
          disabled={refreshDisabled}
          title="Refresh Preview"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      <Input
        className="h-8 flex-1 text-sm pr-8 focus-visible:ring-1 focus-visible:ring-orange-500/50 focus-visible:border-orange-500/50"
        onChange={onChange ?? handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Enter URL..."
        value={value ?? inputValue}
        {...props}
      />
      {onOpenExternal && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 absolute right-1 text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
          onClick={onOpenExternal}
          disabled={externalDisabled}
          title="Open in new tab"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type WebPreviewDeviceSelectorProps = ComponentProps<"div">;

export const WebPreviewDeviceSelector = ({
  className,
  ...props
}: WebPreviewDeviceSelectorProps) => {
  const { device, setDevice } = useWebPreview();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 w-8 p-0 hover:text-orange-400 hover:border-orange-500/50", device && "text-orange-400 border-orange-500/50 bg-orange-500/10", className)}
        >
          {device ? device.icon : <Monitor className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Device Presets</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setDevice(null)}
          className={cn("flex items-center gap-2", !device && "text-orange-400 bg-orange-500/10")}
        >
          <Monitor className="h-4 w-4" />
          <span>Responsive (Auto)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Mobile</DropdownMenuLabel>
        {DEVICE_PRESETS.filter(d => d.type === "mobile").map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onClick={() => setDevice(preset)}
            className={cn("flex items-center justify-between", device?.name === preset.name && "text-orange-400 bg-orange-500/10")}
          >
            <div className="flex items-center gap-2">
              {preset.icon}
              <span>{preset.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {preset.width}×{preset.height}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Tablet</DropdownMenuLabel>
        {DEVICE_PRESETS.filter(d => d.type === "tablet").map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onClick={() => setDevice(preset)}
            className={cn("flex items-center justify-between", device?.name === preset.name && "text-orange-400 bg-orange-500/10")}
          >
            <div className="flex items-center gap-2">
              {preset.icon}
              <span>{preset.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {preset.width}×{preset.height}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export type WebPreviewBodyProps = ComponentProps<"iframe"> & {
  loading?: ReactNode;
  onIframeRef?: (iframe: HTMLIFrameElement | null) => void;
};

export const WebPreviewBody = forwardRef<HTMLIFrameElement, WebPreviewBodyProps>(({
  className,
  loading,
  src,
  onIframeRef,
  ...props
}, ref) => {
  const { url, device } = useWebPreview();
  const internalRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  
  // Combine refs and call the callback
  const setRefs = (iframe: HTMLIFrameElement | null) => {
    // Set internal ref
    (internalRef as React.MutableRefObject<HTMLIFrameElement | null>).current = iframe;
    
    // Forward ref
    if (typeof ref === 'function') {
      ref(iframe);
    } else if (ref) {
      ref.current = iframe;
    }
    
    // Call callback if provided
    onIframeRef?.(iframe);
  };

  // Calculate scale to fit device in container
  useEffect(() => {
    if (!device || !containerRef.current) {
      setScale(1);
      return;
    }

    const calculateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 16; // Small padding
      const containerHeight = container.clientHeight - 16; // Small padding

      // Add device frame padding
      const framePaddingH = device.type === "mobile" ? 20 : device.type === "tablet" ? 16 : 12;
      const framePaddingV = device.type === "mobile" ? 40 : device.type === "tablet" ? 32 : 24;
      
      const totalWidth = device.width + framePaddingH;
      const totalHeight = device.height + framePaddingV;

      const scaleX = containerWidth / totalWidth;
      const scaleY = containerHeight / totalHeight;
      
      // For desktop, allow scaling up to fill container (like responsive mode)
      // For mobile/tablet, don't scale up beyond 1 to maintain realistic device size
      const maxScale = 1;
      const newScale = Math.min(scaleX, scaleY, maxScale);

      setScale(Math.max(0.1, newScale)); // Minimum scale of 0.1
    };

    calculateScale();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateScale);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [device]);

  return (
    <div className="h-full" ref={containerRef}>
      {device ? (
        <div className="h-full flex items-center justify-center overflow-hidden">
          {/* Device frame with actual dimensions */}
          <div
            className={cn(
              "relative overflow-hidden shadow-2xl bg-black",
              device.type === "mobile" && "rounded-[2rem]",
              device.type === "tablet" && "rounded-xl",
            )}
            style={{
              width: device.width + (device.type === "mobile" ? 20 : device.type === "tablet" ? 16 : 12),
              height: device.height + (device.type === "mobile" ? 40 : device.type === "tablet" ? 32 : 24),
              paddingTop: device.type === "mobile" ? 20 : device.type === "tablet" ? 16 : 12,
              paddingBottom: device.type === "mobile" ? 20 : device.type === "tablet" ? 16 : 12,
              paddingLeft: device.type === "mobile" ? 10 : device.type === "tablet" ? 8 : 6,
              paddingRight: device.type === "mobile" ? 10 : device.type === "tablet" ? 8 : 6,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Screen with exact device dimensions */}
            <div
              className="bg-white rounded-sm overflow-hidden"
              style={{
                width: device.width,
                height: device.height,
              }}
            >
              <iframe
                ref={setRefs}
                className={cn("border-0", className)}
                style={{
                  width: device.width,
                  height: device.height,
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                src={(src ?? url) || undefined}
                title="Preview"
                {...props}
              />
            </div>

            {/* Home indicator for mobile */}
            {device.type === "mobile" && (
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-400 rounded-full opacity-50" />
            )}
          </div>
          {loading}
        </div>
      ) : (
        <iframe
          ref={setRefs}
          className={cn("w-full h-full border-0", className)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          src={(src ?? url) || undefined}
          title="Preview"
          {...props}
        />
      )}
      {!device && loading}
    </div>
  );
});

WebPreviewBody.displayName = "WebPreviewBody";

export type ConsoleLogEntry = {
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: Date;
};

// Serialized argument format from visual-editor-client.js
export type SerializedArg = {
  type: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'object' | 'array' | 'function' | 'error' | 'date' | 'regexp' | 'symbol' | 'bigint' | 'html';
  value: any;
};

// Raw browser log format from visual-editor-client.js
export type RawBrowserLog = {
  method: string;
  data: SerializedArg[];
  timestamp: string;
  id: string;
};

export type WebPreviewConsoleProps = ComponentProps<"div"> & {
  logs?: Array<ConsoleLogEntry>;
  terminalLogs?: string[];
  browserLogs?: string[];
  onAskAiToFix?: (errors: string[]) => void;
  onAskAiToFixTerminal?: (errors: string[]) => void;
  onClearBrowserLogs?: () => void;
};

// Deserialize an argument from visual-editor-client.js format to console-feed format
function deserializeArg(arg: SerializedArg): any {
  if (!arg || typeof arg !== 'object') return arg;

  switch (arg.type) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'string': return arg.value;
    case 'number':
      if (arg.value === 'NaN') return NaN;
      if (arg.value === 'Infinity') return Infinity;
      if (arg.value === '-Infinity') return -Infinity;
      return arg.value;
    case 'boolean': return arg.value;
    case 'symbol': return Symbol.for(arg.value);
    case 'bigint': return BigInt(arg.value);
    case 'function': return { __isFunction: true, source: arg.value };
    case 'date': return new Date(arg.value);
    case 'regexp': return arg.value; // Keep as string representation
    case 'error':
      const err = new Error(arg.value?.message || 'Unknown error');
      err.name = arg.value?.name || 'Error';
      err.stack = arg.value?.stack;
      return err;
    case 'array':
      return Array.isArray(arg.value) ? arg.value.map(deserializeArg) : [];
    case 'object':
      if (typeof arg.value === 'object' && arg.value !== null) {
        const obj: Record<string, any> = {};
        for (const key of Object.keys(arg.value)) {
          obj[key] = deserializeArg(arg.value[key]);
        }
        return obj;
      }
      return arg.value;
    case 'html':
      return { __isHTML: true, ...arg.value };
    default:
      return arg.value;
  }
}

// Convert raw browser log to console-feed format
function toConsoleFeedLog(rawLog: RawBrowserLog): ConsoleFeedMessage {
  const deserializedData = rawLog.data.map(deserializeArg);

  return {
    method: rawLog.method as ConsoleFeedMessage['method'],
    data: deserializedData,
    id: rawLog.id,
  };
}

// Extract error message from serialized data for "Ask AI to Fix"
function extractErrorMessage(data: SerializedArg[]): string {
  return data.map(arg => {
    if (arg.type === 'error') {
      return `${arg.value?.name || 'Error'}: ${arg.value?.message || 'Unknown error'}${arg.value?.stack ? '\n' + arg.value.stack : ''}`;
    }
    if (arg.type === 'string') return arg.value;
    if (arg.type === 'object' || arg.type === 'array') {
      try {
        return JSON.stringify(arg.value);
      } catch {
        return String(arg.value);
      }
    }
    return String(arg.value);
  }).join(' ');
}

export const WebPreviewConsole = ({
  className,
  logs = [],
  terminalLogs = [],
  browserLogs = [],
  onAskAiToFix,
  onAskAiToFixTerminal,
  onClearBrowserLogs,
  children,
  ...props
}: WebPreviewConsoleProps) => {
  const { consoleOpen, setConsoleOpen } = useWebPreview();
  const [activeTab, setActiveTab] = useState<"terminal" | "browser">("terminal");
  const [copied, setCopied] = useState(false);

  // Copy logs to clipboard
  const handleCopyLogs = async () => {
    let textToCopy = '';

    if (activeTab === 'terminal') {
      textToCopy = terminalLogs.join('\n');
    } else {
      // Format browser logs for copying
      textToCopy = browserLogs.map((log) => {
        try {
          const parsed = JSON.parse(log) as RawBrowserLog;
          return `[${parsed.method.toUpperCase()}] ${extractErrorMessage(parsed.data)}`;
        } catch {
          return log;
        }
      }).join('\n');
    }

    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Extract terminal errors for "Ask AI to Fix" button
  const terminalErrors = useMemo(() => {
    const errorPatterns = [
      /error/i,
      /ERR!/i,
      /failed/i,
      /exception/i,
      /TypeError/i,
      /ReferenceError/i,
      /SyntaxError/i,
      /Cannot find/i,
      /ENOENT/i,
      /EACCES/i,
      /Module not found/i,
    ];
    return terminalLogs.filter(log =>
      errorPatterns.some(pattern => pattern.test(log))
    );
  }, [terminalLogs]);

  const handleAskAiToFixTerminal = () => {
    if (onAskAiToFixTerminal && terminalErrors.length > 0) {
      onAskAiToFixTerminal(terminalErrors);
    }
  };

  // Parse browser logs from JSON strings to raw format
  const parsedRawLogs = useMemo(() => {
    return browserLogs.map((log, index) => {
      try {
        const parsed = JSON.parse(log) as RawBrowserLog;
        return parsed;
      } catch {
        // Legacy format fallback
        return {
          method: 'log',
          data: [{ type: 'string' as const, value: log }],
          timestamp: new Date().toISOString(),
          id: `legacy-${index}`
        } as RawBrowserLog;
      }
    });
  }, [browserLogs]);

  // Convert to console-feed format
  const consoleFeedLogs = useMemo(() => {
    return parsedRawLogs.map(toConsoleFeedLog);
  }, [parsedRawLogs]);

  // Get error logs for "Ask AI to Fix" button
  const errorLogs = useMemo(() => {
    return parsedRawLogs.filter(log => log.method === 'error' || log.method === 'assert');
  }, [parsedRawLogs]);

  const handleAskAiToFix = () => {
    if (onAskAiToFix && errorLogs.length > 0) {
      const errorMessages = errorLogs.map(log => extractErrorMessage(log.data));
      onAskAiToFix(errorMessages);
    }
  };

  return (
    <Collapsible
      className={cn("border-t font-mono text-sm", className)}
      onOpenChange={setConsoleOpen}
      open={consoleOpen}
      {...props}
    >
      <CollapsibleTrigger asChild>
        <Button
          className={cn(
            "flex w-full items-center justify-between p-4 text-left font-medium hover:bg-orange-500/10",
            consoleOpen && "text-orange-400"
          )}
          variant="ghost"
        >
          <span className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Console
            {errorLogs.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-xs font-medium">
                {errorLogs.length} error{errorLogs.length > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              consoleOpen && "rotate-180"
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "px-4 pb-4",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in"
        )}
      >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "terminal" | "browser")} className="w-full">
          <div className="flex items-center justify-between mb-2">
            <TabsList className="h-8 bg-gray-800/50">
              <TabsTrigger value="terminal" className="text-xs px-3 py-1 gap-1 data-[state=active]:bg-orange-600/15 data-[state=active]:text-orange-400">
                <Terminal className="h-3 w-3" />
                Terminal
              </TabsTrigger>
              <TabsTrigger value="browser" className="text-xs px-3 py-1 gap-1 data-[state=active]:bg-orange-600/15 data-[state=active]:text-orange-400">
                <Globe className="h-3 w-3" />
                Browser
                {consoleFeedLogs.length > 0 && (
                  <span className="ml-1 text-muted-foreground">({consoleFeedLogs.length})</span>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {/* Copy logs button - shown when there are logs to copy */}
              {((activeTab === "terminal" && terminalLogs.length > 0) ||
                (activeTab === "browser" && consoleFeedLogs.length > 0)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 hover:text-orange-400 hover:bg-orange-500/10"
                  onClick={handleCopyLogs}
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
              )}
              {activeTab === "terminal" && terminalErrors.length > 0 && onAskAiToFixTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-orange-400 hover:text-orange-300 border-orange-500/50 hover:border-orange-500 hover:bg-orange-500/10"
                  onClick={handleAskAiToFixTerminal}
                >
                  <Sparkles className="h-3 w-3" />
                  Ask AI to Fix
                </Button>
              )}
              {activeTab === "browser" && errorLogs.length > 0 && onAskAiToFix && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-orange-400 hover:text-orange-300 border-orange-500/50 hover:border-orange-500 hover:bg-orange-500/10"
                  onClick={handleAskAiToFix}
                >
                  <Sparkles className="h-3 w-3" />
                  Ask AI to Fix
                </Button>
              )}
              {activeTab === "browser" && consoleFeedLogs.length > 0 && onClearBrowserLogs && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 hover:text-orange-400 hover:bg-orange-500/10"
                  onClick={onClearBrowserLogs}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="terminal" className="mt-0">
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {terminalLogs.length === 0 && logs.length === 0 ? (
                <p className="text-muted-foreground text-xs">No terminal output</p>
              ) : (
                <>
                  {terminalLogs.map((log, index) => (
                    <div key={`terminal-${index}`} className="text-xs text-foreground whitespace-pre-wrap">
                      {log}
                    </div>
                  ))}
                  {logs.map((log, index) => (
                    <div
                      className={cn(
                        "text-xs",
                        log.level === "error" && "text-destructive",
                        log.level === "warn" && "text-yellow-600",
                        log.level === "log" && "text-foreground"
                      )}
                      key={`log-${log.timestamp.getTime()}-${index}`}
                    >
                      <span className="text-muted-foreground">
                        {log.timestamp.toLocaleTimeString()}
                      </span>{" "}
                      {log.message}
                    </div>
                  ))}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="browser" className="mt-0">
            <div className="max-h-64 overflow-y-auto rounded bg-[#242424]">
              {consoleFeedLogs.length === 0 ? (
                <p className="text-muted-foreground text-xs p-3">No browser console output</p>
              ) : (
                <ConsoleFeed
                  logs={consoleFeedLogs}
                  variant="dark"
                  styles={{
                    BASE_FONT_SIZE: 12,
                    LOG_ICON_WIDTH: 14,
                    LOG_ICON_HEIGHT: 14,
                  }}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
