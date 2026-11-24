import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import MobileNav from "./components/layout/MobileNav"
import CartDrawer from "./components/cart/CartDrawer"
import ChatWidget from "./components/chat/ChatWidget"
import CartToast from "./components/ui/CartToast"
import { RequireAuth, Splash } from "./components/auth/RequireAuth"
import LandingPage from "./pages/LandingPage"
import HomePage from "./pages/HomePage"
import ProductsPage from "./pages/ProductsPage"
import ProductDetailPage from "./pages/ProductDetailPage"
import CheckoutPage from "./pages/CheckoutPage"
import ReceiptPage from "./pages/ReceiptPage"
import OrderHistoryPage from "./pages/OrderHistoryPage"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import AdminDashboardPage from "./pages/AdminDashboardPage"
import OAuth2CallbackPage from "./pages/OAuth2CallbackPage"
import ArchitecturePage from "./pages/ArchitecturePage"
import VerifyEmailPage from "./pages/VerifyEmailPage"
import { JUST_REGISTERED } from "./pages/RegisterPage"
import AccountPage from "./pages/AccountPage"
import VerifyEmailBanner from "./components/account/VerifyEmailBanner"

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/verify-email" ||
    pathname === "/oauth2/callback" ||
    pathname === "/architecture"
  )
}

/** Signed-in user on /register: straight after signup go verify the email, otherwise go home. */
function AfterRegister() {
  // Read only: React StrictMode renders twice, so the flag is cleared by the verify page instead.
  const fresh = sessionStorage.getItem(JUST_REGISTERED) === "1"
  return fresh
    ? <Navigate to="/verify-email" replace state={{ justRegistered: true }} />
    : <Navigate to="/" replace />
}

function AppLayout() {
  const { isAuthenticated, loading } = useAuth()
  const { pathname } = useLocation()

  // Do not hold the landing page for a sleeping Render backend.
  if (loading && !isPublicPath(pathname)) return <Splash />

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
        <Route path="/architecture" element={<ArchitecturePage />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Navigate to="/" replace />
            </RequireAuth>
          }
        />
      </Routes>
    )
  }

  return (
    <div className="linen flex min-h-screen min-w-0 flex-col">
      <Navbar />
      <VerifyEmailBanner />
      <CartDrawer />
      <CartToast />
      <main className="min-w-0 flex-1 pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<AfterRegister />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
          <Route
            path="/products"
            element={
              <RequireAuth>
                <ProductsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/products/:id"
            element={
              <RequireAuth>
                <ProductDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/checkout"
            element={
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            }
          />
          <Route
            path="/receipt/:id"
            element={
              <RequireAuth>
                <ReceiptPage />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/orders"
            element={
              <RequireAuth>
                <OrderHistoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminDashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ChatWidget />
      <Footer />
      <MobileNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppLayout />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
