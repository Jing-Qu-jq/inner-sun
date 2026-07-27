import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import Layout from "./pages/Layout";

export default function App() {
  return (
      <div className="App">
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                  <Route path="/" element={<Layout />}>
                      <Route index element={<HomePage />} />
                      <Route path="chatPage" element={<ChatPage />} />
                  </Route>
              </Routes>
          </HashRouter>
      </div>
  );
}
