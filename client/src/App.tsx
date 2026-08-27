/** Carta Técnica Operacional: a aplicação é uma estação cartográfica, não um dashboard genérico. */
import Home from '@/pages/Home'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  )
}
