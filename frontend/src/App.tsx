import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import Navbar from "./components/layout/Navbar"
import CartDrawer from "./components/cart/CartDrawer"
import FloatingCartButton from "./components/cart/FloatingCartButton"
import ChatWidget from "./components/chat/ChatWidget"
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <CartDrawer />
      <main className="flex-1">
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
      <FloatingCartButton />
      <ChatWidget />
      <footer className="py-8 text-center text-sm text-gray-400 border-t border-surface-100 dark:border-surface-800">
         {new Date().getFullYear()} ShopNow. Built with 
      </footer>
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
