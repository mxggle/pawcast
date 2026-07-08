import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import './i18n'
import { initScrollbarAutoHide } from './utils/scrollbarAutoHide'

const queryClient = new QueryClient()

initScrollbarAutoHide()

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim()
  }
  return String(error)
}

const showFatalError = (title: string, error: unknown) => {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = ''

  const panel = document.createElement('pre')
  panel.style.cssText = [
    'box-sizing:border-box',
    'min-height:100vh',
    'margin:0',
    'padding:24px',
    'white-space:pre-wrap',
    'font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace',
    'background:#111827',
    'color:#f9fafb',
  ].join(';')
  panel.textContent = `${title}\n\n${formatError(error)}`
  root.append(panel)
}

window.addEventListener('error', (event) => {
  showFatalError('Pawcast failed to start', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  showFatalError('Pawcast failed to start', event.reason)
})

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <pre style={{
          boxSizing: 'border-box',
          minHeight: '100vh',
          margin: 0,
          padding: 24,
          whiteSpace: 'pre-wrap',
          font: '13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace',
          background: '#111827',
          color: '#f9fafb',
        }}>
          {`Pawcast failed to render\n\n${formatError(this.state.error)}`}
        </pre>
      )
    }

    return this.props.children
  }
}

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  )
} catch (error) {
  showFatalError('Pawcast failed to start', error)
}
