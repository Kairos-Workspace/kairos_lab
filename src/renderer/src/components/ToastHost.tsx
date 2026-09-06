import { ToastContainer } from 'react-toastify'

export function ToastHost(): React.JSX.Element {
  return (
    <ToastContainer
      newestOnTop
      stacked
      theme="dark"
      toastClassName="quantify-toast"
      className="quantify-toasts"
    />
  )
}
