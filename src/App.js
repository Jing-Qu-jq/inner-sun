import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import Layout from "./pages/Layout";

export default function App() {
  return (
      <div className="App">
          <BrowserRouter>
              <Routes>
                  <Route path="/" element={<Layout />}>
                      <Route
                          index
                          exact
                          element={<HomePage />}
                      />
                      <Route
                          exact
                          path="chatPage"
                          element={<ChatPage />}
                      />
                  </Route>
              </Routes>
          </BrowserRouter>
      </div>
  );
}
