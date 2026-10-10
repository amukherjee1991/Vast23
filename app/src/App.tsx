import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SiteFooter, SiteHeader } from './components/Layout'
import { TooltipProvider } from './components/Tooltip'
import Home from './pages/Home'

const MC1 = lazy(() => import('./pages/MC1'))
const MC2 = lazy(() => import('./pages/MC2'))
const MC3 = lazy(() => import('./pages/MC3'))
const Method = lazy(() => import('./pages/Method'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Loading() {
  return (
    <div className="state" style={{ minHeight: '60vh' }} aria-busy="true">
      <span className="state__halyard" aria-hidden />
      <span>Hoisting the evidence…</span>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <TooltipProvider>
        <ScrollToTop />
        <SiteHeader />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mc1" element={<MC1 />} />
            <Route path="/mc2" element={<MC2 />} />
            <Route path="/mc3" element={<MC3 />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
        <SiteFooter />
      </TooltipProvider>
    </HashRouter>
  )
}
