import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function OAuthCallback() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [ error, setError ] = useState("");

    useEffect(() => {
        const token = params.get("token");
        if (!token) {
            setError("No token returned from provider.");
            return;
        }

        localStorage.setItem("authToken", token);

        api
            .get("/auth/me")
            .then((user) => {
                login(user, token);
                navigate(user.isActive ? "/": "/activate");
            })
            .catch(() => setError("Could not complete sign-in. Please try again."));
    }, [params, login, navigate]);

    return (
        <div className="auth-dark-page">
            <div className="auth-dark-sidebar">
                <div className="auth-dark-content">
                    { error ? (
                        <>
                            <h1 className="auth-dark-title">Sign-in Failed</h1>
                            <p className="auth-dark-subtitle">{error}</p>
                        </>
                    ) : (
                        <p className="auth-dark-subtitle">Signing you in...</p>
                    )}
                </div>
            </div>
        </div>
    )
}