"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase"; // Firebase auth import
import { onAuthStateChanged } from "firebase/auth";

export default function RequestsPage() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user); // Set the user object when logged in
        setName(user.displayName || ""); // Set the name (if available)
        setEmail(user.email || ""); // Set the email
      } else {
        setUser(null); // Clear user when logged out
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle form submission (e.g., sending request)
  const handleSubmit = (e) => {
    e.preventDefault();
    // Your logic for submitting the request, e.g., sending email to cozyandcontentbooks@gmail.com
    console.log("Form submitted", { name, email });
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1>Request a Book</h1>
      {user ? (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="name" style={{ display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              style={{ padding: "8px", width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              required
              style={{ padding: "8px", width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="book" style={{ display: "block", marginBottom: 6 }}>
              Book Request
            </label>
            <input
              id="book"
              type="text"
              placeholder="Book title or details"
              style={{ padding: "8px", width: "100%" }}
            />
          </div>

          <button type="submit" style={{ padding: "10px 20px", backgroundColor: "#0070f3", color: "white", border: "none", cursor: "pointer" }}>
            Submit Request
          </button>
        </form>
      ) : (
        <p>Please log in to submit a book request.</p>
      )}
    </main>
  );
}
