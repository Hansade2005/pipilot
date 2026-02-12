"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, memo, useContext, useMemo } from "react";

type PlanContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
};

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error("Plan components must be used within Plan");
  }
  return context;
};

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Plan = memo(
  ({
    className,
    isStreaming = false,
    defaultOpen = true,
    open,
    onOpenChange,
    children,
    ...props
  }: PlanProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    const planContext = useMemo(
      () => ({ isOpen, setIsOpen, isStreaming }),
      [isOpen, setIsOpen, isStreaming]
    );

    return (
      <PlanContext.Provider value={planContext}>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          {...props}
        >
          <Card
            className={cn(
              "not-prose border-gray-700/60 bg-gray-900/80 text-gray-100 overflow-hidden",
              className
            )}
          >
            {children}
          </Card>
        </Collapsible>
      </PlanContext.Provider>
    );
  }
);

export type PlanHeaderProps = ComponentProps<typeof CardHeader>;

export const PlanHeader = memo(
  ({ className, children, ...props }: PlanHeaderProps) => (
    <CardHeader
      className={cn("pb-0", className)}
      {...props}
    >
      {children}
    </CardHeader>
  )
);

export type PlanTitleProps = Omit<
  ComponentProps<typeof CardTitle>,
  "children"
> & {
  children?: string;
};

export const PlanTitle = memo(
  ({ className, children, ...props }: PlanTitleProps) => {
    const { isStreaming } = usePlan();

    return (
      <CardTitle
        className={cn(
          "text-base font-semibold text-gray-100",
          isStreaming && !children && "h-5 w-48 animate-pulse rounded bg-gray-700/50",
          className
        )}
        {...props}
      >
        {children}
      </CardTitle>
    );
  }
);

export type PlanDescriptionProps = Omit<
  ComponentProps<typeof CardDescription>,
  "children"
> & {
  children?: string;
};

export const PlanDescription = memo(
  ({ className, children, ...props }: PlanDescriptionProps) => {
    const { isStreaming } = usePlan();

    return (
      <CardDescription
        className={cn(
          "text-gray-400 text-sm",
          isStreaming &&
            !children &&
            "mt-2 h-4 w-full animate-pulse rounded bg-gray-700/50",
          className
        )}
        {...props}
      >
        {children}
      </CardDescription>
    );
  }
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = memo(
  ({ className, ...props }: PlanTriggerProps) => {
    const { isOpen } = usePlan();

    return (
      <CollapsibleTrigger
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800 hover:text-orange-400",
          className
        )}
        {...props}
      >
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform duration-200",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>
    );
  }
);

export type PlanContentProps = ComponentProps<typeof CardContent>;

export const PlanContent = memo(
  ({ className, children, ...props }: PlanContentProps) => (
    <CollapsibleContent>
      <CardContent
        className={cn(
          "pt-0 text-sm text-gray-300",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=open]:animate-in",
          className
        )}
        {...props}
      >
        {children}
      </CardContent>
    </CollapsibleContent>
  )
);

export type PlanFooterProps = ComponentProps<"div">;

export const PlanFooter = memo(
  ({ className, children, ...props }: PlanFooterProps) => (
    <div
      className={cn("flex items-center gap-2 px-6 pb-4 pt-2", className)}
      {...props}
    >
      {children}
    </div>
  )
);

export type PlanActionProps = ComponentProps<typeof CardAction>;

export const PlanAction = memo(
  ({ className, children, ...props }: PlanActionProps) => (
    <CardAction className={cn(className)} {...props}>
      {children}
    </CardAction>
  )
);

Plan.displayName = "Plan";
PlanHeader.displayName = "PlanHeader";
PlanTitle.displayName = "PlanTitle";
PlanDescription.displayName = "PlanDescription";
PlanTrigger.displayName = "PlanTrigger";
PlanContent.displayName = "PlanContent";
PlanFooter.displayName = "PlanFooter";
PlanAction.displayName = "PlanAction";
