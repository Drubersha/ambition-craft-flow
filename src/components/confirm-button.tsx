import { forwardRef, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmButtonProps = Omit<ButtonProps, "onClick"> & {
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  children: ReactNode;
};

/**
 * Trigger button that opens an accessible AlertDialog confirmation
 * before invoking onConfirm. Replaces native window.confirm().
 */
export const ConfirmButton = forwardRef<HTMLButtonElement, ConfirmButtonProps>(
  function ConfirmButton(
    {
      title = "Подтвердите действие",
      description,
      confirmText = "Подтвердить",
      cancelText = "Отмена",
      destructive,
      onConfirm,
      children,
      className,
      ...buttonProps
    },
    ref,
  ) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button ref={ref} className={className} {...buttonProps}>
            {children}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelText}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={cn(
                destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive",
              )}
            >
              {confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);
