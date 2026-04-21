import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { db, auth } from "./firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

function formatCHF(value) {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString("de-CH");
    }

    return new Date(value).toLocaleString("de-CH");
  } catch {
    return "-";
  }
}

function StatCard({ title, value }) {
  return (
    <div className="card stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div className="mini-info">
      <div className="mini-label">{label}</div>
      <div className="mini-value">{value}</div>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ twintNumber: "0794826733" });

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [stockToAdd, setStockToAdd] = useState("");
  const [stockToRemove, setStockToRemove] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("mitarbeiter");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminUid, setAdminUid] = useState(null);

  const [loading, setLoading] = useState(true);

  const activeProducts = useMemo(
    () => products.filter((product) => product.active !== false),
    [products]
  );

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(
      query(collection(db, "products"), orderBy("sortOrder", "asc")),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setProducts(list);
      }
    );

    const unsubscribeMembers = onSnapshot(
      query(collection(db, "members"), orderBy("name", "asc")),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setMembers(list);
      }
    );

    const unsubscribeTransactions = onSnapshot(
      query(collection(db, "transactions"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setTransactions(list);
        setLoading(false);
      }
    );

    const unsubscribeSettings = onSnapshot(doc(db, "settings", "general"), (snapshot) => {
      if (snapshot.exists()) {
        setSettings({
          twintNumber: snapshot.data().twintNumber || "0794826733",
        });
      }
    });

    return () => {
      unsubscribeProducts();
      unsubscribeMembers();
      unsubscribeTransactions();
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (!selectedProductId && activeProducts.length > 0) {
      setSelectedProductId(activeProducts[0].id);
    }
  }, [activeProducts, selectedProductId]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdminAuth(false);
        setAdminUid(null);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (adminDoc.exists()) {
          setIsAdminAuth(true);
          setAdminUid(user.uid);
        } else {
          setIsAdminAuth(false);
          setAdminUid(null);
        }
      } catch {
        setIsAdminAuth(false);
        setAdminUid(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const memberStatsMap = useMemo(() => {
    const map = {};

    for (const member of members) {
      map[member.id] = {
        beers: 0,
        total: 0,
        paidAmount: 0,
        open: 0,
      };
    }

    for (const tx of transactions) {
      const memberId = tx.memberId;
      if (!memberId) continue;

      if (!map[memberId]) {
        map[memberId] = {
          beers: 0,
          total: 0,
          paidAmount: 0,
          open: 0,
        };
      }

      if (tx.type === "purchase") {
        map[memberId].beers += Number(tx.quantity || 0);
        map[memberId].total += Number(tx.total || 0);
      }

      if (tx.type === "payment") {
        map[memberId].paidAmount += Number(tx.total || 0);
      }

      if (tx.type === "correction") {
        map[memberId].beers -= Number(tx.quantity || 0);
        map[memberId].total -= Math.abs(Number(tx.total || 0));
      }

      if (tx.type === "reset") {
        map[memberId] = {
          beers: 0,
          total: 0,
          paidAmount: 0,
          open: 0,
        };
      }
    }

    for (const memberId of Object.keys(map)) {
      map[memberId].beers = Math.max(0, map[memberId].beers);
      map[memberId].total = Math.max(0, map[memberId].total);
      map[memberId].paidAmount = Math.max(0, map[memberId].paidAmount);
      map[memberId].open = Math.max(0, map[memberId].total - map[memberId].paidAmount);
    }

    return map;
  }, [members, transactions]);

  const currentMember = members.find((m) => m.id === selectedMemberId);
  const currentProduct = products.find((p) => p.id === selectedProductId);
  const currentMemberStats = currentMember
    ? memberStatsMap[currentMember.id] || { beers: 0, total: 0, paidAmount: 0, open: 0 }
    : { beers: 0, total: 0, paidAmount: 0, open: 0 };

  const totalOpen = useMemo(() => {
    return Object.values(memberStatsMap).reduce(
      (sum, entry) => sum + Number(entry.open || 0),
      0
    );
  }, [memberStatsMap]);

  const totalBeers = useMemo(() => {
    return Object.values(memberStatsMap).reduce(
      (sum, entry) => sum + Number(entry.beers || 0),
      0
    );
  }, [memberStatsMap]);

  const totalStock = useMemo(() => {
    return products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  }, [products]);

  const handleAdminLogin = async () => {
    if (!adminEmail.trim() || !adminPasswordInput.trim()) {
      alert("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPasswordInput);
      setAdminPasswordInput("");
    } catch (error) {
      alert(`Login fehlgeschlagen: ${error.message}`);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
      setIsAdminAuth(false);
      setAdminUid(null);
    } catch (error) {
      alert(`Logout fehlgeschlagen: ${error.message}`);
    }
  };

  const copyTwint = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(settings.twintNumber || "");
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = settings.twintNumber || "";
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert(`Bitte Nummer manuell kopieren: ${settings.twintNumber || ""}`);
    }
  };

  const addBeer = async (memberId) => {
    const member = members.find((m) => m.id === memberId);
    const product = products.find((p) => p.id === selectedProductId);

    if (!member) {
      alert("Bitte einen Mitarbeiter auswählen.");
      return;
    }

    if (!product) {
      alert("Bitte ein Produkt auswählen.");
      return;
    }

    if (Number(product.stock || 0) <= 0) {
      alert("Dieses Produkt ist nicht mehr auf Lager.");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", product.id);
        const freshProductSnap = await transaction.get(productRef);

        if (!freshProductSnap.exists()) {
          throw new Error("Produkt nicht gefunden.");
        }

        const freshProduct = freshProductSnap.data();
        const currentStock = Number(freshProduct.stock || 0);

        if (currentStock <= 0) {
          throw new Error("Dieses Produkt ist nicht mehr auf Lager.");
        }

        transaction.update(productRef, {
          stock: currentStock - 1,
        });

        const txRef = doc(collection(db, "transactions"));
        transaction.set(txRef, {
          memberId: member.id,
          memberName: member.name,
          productId: product.id,
          productName: freshProduct.name,
          quantity: 1,
          unitPrice: Number(freshProduct.price || 0),
          total: Number(freshProduct.price || 0),
          type: "purchase",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || null,
        });
      });
    } catch (error) {
      alert(`Buchung fehlgeschlagen: ${error.message}`);
    }
  };

  const removeBeer = async (memberId) => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen Korrekturen machen.");
      return;
    }

    const member = members.find((m) => m.id === memberId);
    const product = products.find((p) => p.id === selectedProductId);
    const stats = memberStatsMap[memberId];

    if (!member || !product) return;

    if (!stats || Number(stats.beers || 0) <= 0) {
      alert("Für diesen Mitarbeiter gibt es nichts zu korrigieren.");
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", product.id);
        const freshProductSnap = await transaction.get(productRef);

        if (!freshProductSnap.exists()) {
          throw new Error("Produkt nicht gefunden.");
        }

        const freshProduct = freshProductSnap.data();
        const currentStock = Number(freshProduct.stock || 0);

        transaction.update(productRef, {
          stock: currentStock + 1,
        });

        const txRef = doc(collection(db, "transactions"));
        transaction.set(txRef, {
          memberId: member.id,
          memberName: member.name,
          productId: product.id,
          productName: freshProduct.name,
          quantity: 1,
          unitPrice: Number(freshProduct.price || 0),
          total: Number(freshProduct.price || 0),
          type: "correction",
          createdAt: serverTimestamp(),
          createdBy: adminUid,
        });
      });
    } catch (error) {
      alert(`Korrektur fehlgeschlagen: ${error.message}`);
    }
  };

  const markPaid = async (memberId) => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen Zahlungen markieren.");
      return;
    }

    const member = members.find((m) => m.id === memberId);
    const stats = memberStatsMap[memberId];

    if (!member || !stats) return;

    if (Number(stats.open || 0) <= 0) {
      alert("Für diesen Mitarbeiter ist nichts offen.");
      return;
    }

    try {
      await addDoc(collection(db, "transactions"), {
        memberId: member.id,
        memberName: member.name,
        quantity: 0,
        unitPrice: 0,
        total: Number(stats.open || 0),
        type: "payment",
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });
    } catch (error) {
      alert(`Zahlung konnte nicht gespeichert werden: ${error.message}`);
    }
  };

  const resetMember = async (memberId) => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen zurücksetzen.");
      return;
    }

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const confirmed = window.confirm(
      `${member.name} wirklich zurücksetzen? Offene Beträge und Statistik werden danach auf 0 dargestellt.`
    );

    if (!confirmed) return;

    try {
      await addDoc(collection(db, "transactions"), {
        memberId: member.id,
        memberName: member.name,
        quantity: 0,
        unitPrice: 0,
        total: 0,
        type: "reset",
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });
    } catch (error) {
      alert(`Reset fehlgeschlagen: ${error.message}`);
    }
  };

  const addMember = async () => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen Mitglieder anlegen.");
      return;
    }

    const name = newMemberName.trim();
    if (!name) return;

    try {
      const ref = await addDoc(collection(db, "members"), {
        name,
        active: true,
        createdAt: serverTimestamp(),
      });

      setNewMemberName("");
      setSelectedMemberId(ref.id);
    } catch (error) {
      alert(`Mitglied konnte nicht erstellt werden: ${error.message}`);
    }
  };

  const deleteMember = async (memberId) => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen Mitglieder löschen.");
      return;
    }

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const confirmed = window.confirm(`${member.name} wirklich löschen?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "members", memberId));
    } catch (error) {
      alert(`Mitglied konnte nicht gelöscht werden: ${error.message}`);
    }
  };

  const addStock = async () => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen den Bestand ändern.");
      return;
    }

    const value = Number(stockToAdd);
    if (!Number.isFinite(value) || value <= 0) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      alert("Bitte ein Produkt auswählen.");
      return;
    }

    try {
      await updateDoc(doc(db, "products", product.id), {
        stock: Number(product.stock || 0) + value,
      });

      await addDoc(collection(db, "transactions"), {
        memberId: null,
        memberName: "Admin",
        productId: product.id,
        productName: product.name,
        quantity: value,
        unitPrice: 0,
        total: 0,
        type: "stock_add",
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setStockToAdd("");
    } catch (error) {
      alert(`Bestand konnte nicht erhöht werden: ${error.message}`);
    }
  };

  const removeStock = async () => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen den Bestand ändern.");
      return;
    }

    const value = Number(stockToRemove);
    if (!Number.isFinite(value) || value <= 0) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      alert("Bitte ein Produkt auswählen.");
      return;
    }

    try {
      const nextStock = Math.max(0, Number(product.stock || 0) - value);

      await updateDoc(doc(db, "products", product.id), {
        stock: nextStock,
      });

      await addDoc(collection(db, "transactions"), {
        memberId: null,
        memberName: "Admin",
        productId: product.id,
        productName: product.name,
        quantity: Math.min(value, Number(product.stock || 0)),
        unitPrice: 0,
        total: 0,
        type: "stock_remove",
        createdAt: serverTimestamp(),
        createdBy: adminUid,
      });

      setStockToRemove("");
    } catch (error) {
      alert(`Bestand konnte nicht reduziert werden: ${error.message}`);
    }
  };

  const updateProductPrice = async (productId, newPrice) => {
    if (!isAdminAuth) {
      alert("Nur Admins dürfen Preise ändern.");
      return;
    }

    const parsed = Number(newPrice);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    try {
      await updateDoc(doc(db, "products", productId), {
        price: parsed,
      });
    } catch (error) {
      alert(`Preis konnte nicht geändert werden: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="card">
            <h2>Lade Bierkasse...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1>Bierkasse</h1>
            <p className="subtitle">Gemeinsame Firebase-Web-App für den Betrieb</p>
          </div>

          <div className="card twint-box">
            <div className="twint-label">TWINT</div>
            <div className="twint-row">
              <strong>{settings.twintNumber || "-"}</strong>
              <button className="btn btn-outline" onClick={copyTwint}>
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard title="Produkte" value={String(activeProducts.length)} />
          <StatCard title="Mitglieder" value={String(members.length)} />
          <StatCard title="Konsumierte Bier" value={String(totalBeers)} />
          <StatCard title="Offener Gesamtbetrag" value={formatCHF(totalOpen)} />
        </div>

        <div className="tabs">
          <button
            className={activeTab === "mitarbeiter" ? "tab active" : "tab"}
            onClick={() => setActiveTab("mitarbeiter")}
          >
            Mitarbeiter
          </button>
          <button
            className={activeTab === "admin" ? "tab active" : "tab"}
            onClick={() => setActiveTab("admin")}
          >
            Admin
          </button>
          <button
            className={activeTab === "verlauf" ? "tab active" : "tab"}
            onClick={() => setActiveTab("verlauf")}
          >
            Verlauf
          </button>
        </div>

        {activeTab === "mitarbeiter" && (
          <div className="two-col">
            <div className="card">
              <h2>Bier erfassen</h2>

              <label className="label">Mitarbeiter auswählen</label>
              <select
                className="input"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>

              <label className="label">Produkt auswählen</label>
              <select
                className="input"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                {activeProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {formatCHF(product.price)} · Bestand {product.stock || 0}
                  </option>
                ))}
              </select>

              {currentMember ? (
                <div className="member-box">
                  <div className="member-header">
                    <h3>{currentMember.name}</h3>
                    <span className="badge">{currentMemberStats.beers} Bier</span>
                  </div>

                  <div className="mini-grid">
                    <MiniInfo label="Offen" value={formatCHF(currentMemberStats.open)} />
                    <MiniInfo label="Bezahlt" value={formatCHF(currentMemberStats.paidAmount)} />
                    <MiniInfo label="Total" value={formatCHF(currentMemberStats.total)} />
                  </div>

                  <div className="button-row">
                    <button className="btn" onClick={() => addBeer(currentMember.id)}>
                      1 Bier hinzufügen
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={() => removeBeer(currentMember.id)}
                    >
                      1 Bier entfernen
                    </button>
                  </div>
                </div>
              ) : (
                <p>Bitte zuerst einen Mitarbeiter anlegen.</p>
              )}
            </div>

            <div className="card">
              <h2>Bestand & Zahlung</h2>

              <div className="info-box">
                <div className="muted">Aktueller Gesamtbestand</div>
                <div className="big-number">{totalStock}</div>
                <div className="muted">Flaschen / Dosen</div>
              </div>

              <div className="info-box">
                <div className="muted">Ausgewähltes Produkt</div>
                <div className="big-text">{currentProduct?.name || "-"}</div>
                <div className="muted">
                  Preis {formatCHF(currentProduct?.price || 0)} · Bestand{" "}
                  {currentProduct?.stock || 0}
                </div>
              </div>

              <div className="info-box">
                <div className="muted">TWINT an</div>
                <div className="big-text">{settings.twintNumber || "-"}</div>
                <div className="muted">
                  Nach Zahlung kann im Admin-Bereich als bezahlt markiert werden.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "admin" && (
          <>
            {!isAdminAuth ? (
              <div className="card admin-login">
                <h2>Admin Login</h2>

                <input
                  type="email"
                  className="input"
                  placeholder="Admin E-Mail"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />

                <input
                  type="password"
                  className="input"
                  placeholder="Passwort"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdminLogin();
                  }}
                />

                <button className="btn full" onClick={handleAdminLogin}>
                  Login
                </button>
              </div>
            ) : (
              <div className="two-col">
                <div className="card">
                  <div className="section-head">
                    <h2>Mitglieder verwalten</h2>
                    <button className="btn btn-outline" onClick={handleAdminLogout}>
                      Logout
                    </button>
                  </div>

                  <div className="inline-row">
                    <input
                      className="input"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="Neuer Mitarbeiter"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addMember();
                      }}
                    />
                    <button className="btn" onClick={addMember}>
                      Hinzufügen
                    </button>
                  </div>

                  <div className="list">
                    {members.map((member) => {
                      const stats = memberStatsMap[member.id] || {
                        beers: 0,
                        total: 0,
                        paidAmount: 0,
                        open: 0,
                      };

                      return (
                        <div key={member.id} className="list-item">
                          <div>
                            <div className="member-name">{member.name}</div>
                            <div className="muted">
                              {stats.beers} Bier · Total {formatCHF(stats.total)} · Offen{" "}
                              {formatCHF(stats.open)}
                            </div>
                          </div>

                          <div className="button-row wrap">
                            <button
                              className="btn btn-outline"
                              onClick={() => markPaid(member.id)}
                            >
                              Bezahlt
                            </button>
                            <button
                              className="btn btn-outline"
                              onClick={() => resetMember(member.id)}
                            >
                              Zurücksetzen
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => deleteMember(member.id)}
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="right-col">
                  <div className="card">
                    <h2>Produkte / Preise</h2>

                    {products.length === 0 ? (
                      <p className="muted">Keine Produkte vorhanden.</p>
                    ) : (
                      <div className="list">
                        {products.map((product) => (
                          <div key={product.id} className="list-item">
                            <div>
                              <div className="member-name">{product.name}</div>
                              <div className="muted">
                                Bestand {product.stock || 0}
                              </div>
                            </div>

                            <input
                              type="number"
                              step="0.1"
                              className="input"
                              defaultValue={product.price || 0}
                              onBlur={(e) =>
                                updateProductPrice(product.id, e.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <h2>Bestand verwalten</h2>

                    <label className="label">Produkt</label>
                    <select
                      className="input"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>

                    <label className="label">Bestand erhöhen</label>
                    <input
                      type="number"
                      className="input"
                      value={stockToAdd}
                      onChange={(e) => setStockToAdd(e.target.value)}
                      placeholder="z. B. 24"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addStock();
                      }}
                    />
                    <button className="btn full" onClick={addStock}>
                      Bestand erhöhen
                    </button>

                    <label className="label top-space">Bestand vermindern</label>
                    <input
                      type="number"
                      className="input"
                      value={stockToRemove}
                      onChange={(e) => setStockToRemove(e.target.value)}
                      placeholder="z. B. 6"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") removeStock();
                      }}
                    />
                    <button className="btn btn-outline full" onClick={removeStock}>
                      Bestand vermindern
                    </button>
                  </div>

                  <div className="card">
                    <h2>Hinweis</h2>
                    <p className="muted">
                      Diese Version nutzt Firebase. Alle Nutzer sehen dieselben Daten.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "verlauf" && (
          <div className="card">
            <h2>Verlauf</h2>

            {transactions.length === 0 ? (
              <p className="muted">Noch keine Einträge vorhanden.</p>
            ) : (
              <div className="list">
                {transactions.map((entry) => (
                  <div key={entry.id} className="list-item">
                    <div>
                      <div className="member-name">
                        {entry.type === "purchase" && "Bier hinzugefügt"}
                        {entry.type === "payment" && "Als bezahlt markiert"}
                        {entry.type === "correction" && "Bier entfernt"}
                        {entry.type === "reset" && "Konto zurückgesetzt"}
                        {entry.type === "stock_add" && "Bestand erhöht"}
                        {entry.type === "stock_remove" && "Bestand vermindert"}
                        {entry.memberName ? ` · ${entry.memberName}` : ""}
                        {entry.productName ? ` · ${entry.productName}` : ""}
                      </div>
                      <div className="muted">{formatDate(entry.createdAt)}</div>
                    </div>
                    <div className="badge">
                      {entry.type === "payment"
                        ? `+ ${formatCHF(entry.total)}`
                        : entry.type === "purchase"
                        ? `${formatCHF(entry.total)}`
                        : entry.type === "correction"
                        ? `-${formatCHF(entry.total)}`
                        : entry.total
                        ? formatCHF(entry.total)
                        : "Info"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}