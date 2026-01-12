import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const schema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(1, "Укажите пароль")
});

type FormData = z.infer<typeof schema>;

export const LoginPage: React.FC = () => {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormData) => {
    setSubmitting(true);
    try {
      await login(values);
      navigate("/projects");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Вход</h2>
      <form className="form" onSubmit={handleSubmit(onSubmit)}>
        <label className="label">Email</label>
        <input className="input" type="email" {...register("email")}></input>
        {errors.email && <span className="error">{errors.email.message}</span>}

        <label className="label">Пароль</label>
        <input className="input" type="password" {...register("password")}></input>
        {errors.password && <span className="error">{errors.password.message}</span>}

        {error && <div className="error">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Входим..." : "Войти"}
        </button>
        <p className="muted">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
};
