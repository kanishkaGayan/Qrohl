import * as React from "react";

import { cn } from "@/lib/utils";

function Form({ className, ...props }: React.ComponentProps<"form">) {
  return <form className={cn("space-y-4", className)} {...props} />;
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-destructive", className)} {...props} />;
}

export { Form, FormItem, FormMessage };
