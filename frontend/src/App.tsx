import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import Navbar from "./components/layout/Navbar"
import Footer from "./components/layout/Footer"
import MobileNav from "./components/layout/MobileNav"
import CartDrawer from "./components/cart/CartDrawer"
import ChatWidget from "./components/chat/ChatWidget"
import CartToast from "./components/ui/CartToast"
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
  return (
    <div className="linen flex min-h-screen flex-col">
      <Navbar />
      <CartDrawer />
      <CartToast />
      <main className="flex-1 pb-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/receipt/:id" element={<ReceiptPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
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
