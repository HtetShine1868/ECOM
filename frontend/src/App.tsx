import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom"
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

function AppLayout() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <Splash />

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
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
    <div className="linen flex min-h-screen flex-col">
      <Navbar />
      <CartDrawer />
      <CartToast />
      <main className="flex-1 pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
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
