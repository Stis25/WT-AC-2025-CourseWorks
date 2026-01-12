import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const schema = z.object({
  username: z.string().min(3, "Минимум 3 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(8, "Минимум 8 символов")
});

type FormData = z.infer<typeof schema>;

export const RegisterPage: React.FC = () => {
  const { register: doRegister, error } = useAuth();
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
      await doRegister(values);
      navigate("/projects");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Регистрация</h2>
      <form className="form" onSubmit={handleSubmit(onSubmit)}>
        <label className="label">Имя пользователя</label>
        <input className="input" {...register("username")} />
        {errors.username && <span className="error">{errors.username.message}</span>}

        <label className="label">Email</label>
        <input className="input" type="email" {...register("email")} />
        {errors.email && <span className="error">{errors.email.message}</span>}

        <label className="label">Пароль</label>
        <input className="input" type="password" {...register("password")} />
        {errors.password && <span className="error">{errors.password.message}</span>}

        {error && <div className="error">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Создаём..." : "Создать аккаунт"}
        </button>
        <p className="muted">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
};
