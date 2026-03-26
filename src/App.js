import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import Layout from "./pages/Layout";

export default function App() {
  return (
      <div className="App">
          <HashRouter>
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
          </HashRouter>
      </div>
  );
}
