import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'default' | 'ghost'
}

function Button({ className, variant = 'default', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn('inline-flex items-center justify-center', variant === 'ghost' && 'bg-transparent', className)} {...props} />
}

export { Button }
