import React from "react";
import { Link } from "react-router-dom";

export const NotFoundPage: React.FC = () => (
  <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
    <h2>404 — Страница не найдена</h2>
    <p className="muted">Проверьте адрес или вернитесь на список проектов.</p>
    <Link className="btn btn-primary" to="/projects">
      На проекты
    </Link>
  </div>
);
