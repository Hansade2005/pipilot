"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      shikiTheme={['github-light', 'github-dark-dimmed']}
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words overflow-hidden [overflow-wrap:anywhere]",
        // Enhanced spacing and readability for reasoning content
        "leading-relaxed", // Relaxed line height for better readability
        "[&>p]:mb-4 [&>p]:last:mb-0", // Paragraph spacing
        "[&>ul]:mb-4 [&>ul]:last:mb-0", // List spacing
        "[&>ol]:mb-4 [&>ol]:last:mb-0", // Ordered list spacing
        "[&>li]:mb-2", // List item spacing
        "[&>blockquote]:mb-4 [&>blockquote]:border-l-4 [&>blockquote]:border-gray-300 [&>blockquote]:pl-4 [&>blockquote]:italic", // Blockquote styling
        "[&>pre]:mb-4 [&>pre]:overflow-x-auto [&>pre]:rounded-lg [&>pre]:border [&>pre]:border-gray-700/50", // Code block spacing and styling
        "[&>h1]:mb-4 [&>h1]:text-2xl [&>h1]:font-bold", // Heading spacing
        "[&>h2]:mb-3 [&>h2]:text-xl [&>h2]:font-semibold",
        "[&>h3]:mb-2 [&>h3]:text-lg [&>h3]:font-medium",
        "[&>h4]:mb-2 [&>h4]:text-base [&>h4]:font-medium",
        "[&>h5]:mb-2 [&>h5]:text-sm [&>h5]:font-medium",
        "[&>h6]:mb-2 [&>h6]:text-xs [&>h6]:font-medium",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
