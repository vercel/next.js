"use client";

import * as React from "react";
import { useForm, SubmitHandler } from "react-hook-form";

import styles from "../_styles/main.module.css";

interface User {
  name: string;
}

interface LoginFormValues {
  username: string;
  password: string;
  remember: boolean;
}

export default function Main() {
  const [user, setUser] = React.useState<User | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const onSubmit: SubmitHandler<LoginFormValues> = ({
    username,
    password,
    remember,
  }) => {
    setUser({ name: username });
  };

  return (
    <div className={styles.container}>
      {user ? (
        <div className={styles.greeting}>
          <h2>Welcome back, {user.name}!</h2>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <h2 className={styles.header}>Login</h2>
          <div className={styles.field}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              {...register("username", {
                required: "Username is required",
                minLength: {
                  value: 3,
                  message: "Username must be at least 3 characters",
                },
              })}
              className={`${styles.input} ${errors.username ? styles.errorInput : ""}`}
              placeholder="Enter your username"
            />
            {errors.username && (
              <span className={styles.errorMessage}>
                {errors.username.message}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              {...register("password", { required: "Password is required" })}
              className={`${styles.input} ${errors.password ? styles.errorInput : ""}`}
              placeholder="Enter your password"
            />
            {errors.password && (
              <span className={styles.errorMessage}>
                {errors.password.message}
              </span>
            )}
          </div>
          <div className={styles.rememberMe}>
            <input id="remember" type="checkbox" {...register("remember")} />
            <label htmlFor="remember">Remember me</label>
          </div>
          <button type="submit" className={styles.submitButton}>
            Login
          </button>
        </form>
      )}
    </div>
  );
}
