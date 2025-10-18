"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase"; // Firebase auth import
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function RequestsPage() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [requestedBooks, setRequestedBooks] = useState([]);
  const [selectedBooks, setSelectedBooks] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setName(user.displayName || "A Cozy Shopper"); // Set displayName or default to a fallback name
        setEmail(user.email || "");
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    // Fetch requested books from Firestore
    const fetchRequestedBooks = async () => {
      const booksRef = collection(db, "users", user.uid, "bookRequests");
      const q = query(booksRef, where("status", "==", "requested"));
      const querySnapshot = await getDocs(q);
      
      const books = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      setRequestedBooks(books);
    };

    fetchRequestedBooks();
  }, [user]);

  const handleCheckboxChange = (event, bookId) => {
    setSelectedBooks((prevSelectedBooks) =>
      event.target.checked
        ? [...prevSelectedBooks, bookId]
        : prevSelectedBooks.filter((id) => id !== bookId)
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Create the email content (in a real app, you would send this via email)
    const orderDetails = requestedBooks
      .filter((book) => selectedBooks.includes(book.id))
      .map((book) => `${book.title} by ${book.author}`)
      .join("\n");

    const emailContent = `
      Name: ${name}
      Email: ${email}
      Order Details:
      ${orderDetails}
    `;

    console.log("Order submitted:", emailContent);

    // Your logic for submitting the request, e.g., sending email to cozyandcontentbooks@gmail.com
    // You can use a cloud function or any API for sending emails.

    // For now, just show a message
    alert("Order submitted! We will confirm if it's in stock.");
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
            <label style={{ display: "block", marginBottom: 6 }}>Select Books to Order</label>
            {requestedBooks.length === 0 ? (
              <p>No books requested yet.</p>
            ) : (
              requestedBooks.map((book) => (
                <div key={book.id} style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    id={`book-${book.id}`}
                    onChange={(e) => handleCheckboxChange(e, book.id)}
                    checked={selectedBooks.includes(book.id)}
                    style={{ marginRight: 8 }}
                  />
                  <label htmlFor={`book-${book.id}`} style={{ fontSize: 14 }}>
                    {book.title} by {book.author}
                  </label>
                </div>
              ))
            )}
          </div>

          <button type="submit" style={{ padding: "10px 20px", backgroundColor: "#0070f3", color: "white", border: "none", cursor: "pointer" }}>
            Submit Order
          </button>
        </form>
      ) : (
        <p>Please log in to submit a book request.</p>
      )}
    </main>
  );
}
