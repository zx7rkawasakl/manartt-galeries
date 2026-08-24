import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import Landing from './routes/Landing'
import AdminGuard from './components/AdminGuard'
import { clearLegacyStorage } from './lib/cleanup'

// Les donnees de la maquette ne servent plus a rien : on libere la place.
clearLegacyStorage()

// La landing est la porte d'entree : elle ne doit embarquer ni la grille
// justifiee, ni la visionneuse, ni tout l'espace photographe. Ces routes
// arrivent dans des chunks separes.
const Gallery = lazy(() => import('./routes/Gallery'))
const AdminLogin = lazy(() => import('./routes/AdminLogin'))
const AdminDashboard = lazy(() => import('./routes/AdminDashboard'))
const AdminGallery = lazy(() => import('./routes/AdminGallery'))
const AdminDraw = lazy(() => import('./routes/AdminDraw'))
const AdminStory = lazy(() => import('./routes/AdminStory'))
const NotFound = lazy(() => import('./routes/NotFound'))

/** Ecran d'attente pendant le telechargement du chunk. */
function RouteFallback() {
  return <div className="min-h-dvh bg-paper" />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Cote client */}
          <Route path="/" element={<Landing />} />
          <Route path="/g/:code" element={<Gallery />} />

          {/* Cote photographe. La garde enveloppe les routes protegees : la
              session n'est demandee au serveur qu'une fois, puis partagee. */}
          <Route path="/admin/connexion" element={<AdminLogin />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/g/:id" element={<AdminGallery />} />
            <Route path="/admin/story" element={<AdminStory />} />
            <Route path="/admin/tirage" element={<AdminDraw />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
