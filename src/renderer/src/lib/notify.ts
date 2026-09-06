import { toast, type Id, type ToastOptions } from 'react-toastify'

const base: ToastOptions = {
  position: 'top-right',
  autoClose: 3400,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  pauseOnFocusLoss: false,
  draggable: false
}

export function notifySuccess(message: string): Id {
  return toast.success(message, base)
}

export function notifyInfo(message: string): Id {
  return toast.info(message, { ...base, autoClose: 2800 })
}

export function notifyError(message: string, error?: unknown): Id {
  const text = error instanceof Error && error.message ? error.message : message
  return toast.error(text, { ...base, autoClose: 5600 })
}
