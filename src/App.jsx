import { useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "bierkasse_app_v1";
const DEFAULT_PRICE = 2;
const TWINT_NUMBER = "0794826733";
const ADMIN_PASSWORD = "bier123";

const defaultState = {
  pricePerBeer: DEFAULT_PRICE,
  members: [
    { id: crypto.randomUUID(), name: "Selim", beers: 0, paidAmount: 0 },
    { id: crypto.randomUUID(), name: "Mitarbeiter 2", beers: 0, paidAmount: 0 },
    { id: crypto.randomUUID(), name: "Mitarbeiter 3", beers: 0, paidAmount: 0 },
  ],
  transactions: [],
  stock: 24,
};

function formatCHF(value) {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
  }).format(value);
}

function todayDateTime() {
  return new Date().toLocaleString("de-CH");
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
  const [data, setData] = useState(defaultState);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [stockToAdd, setStockToAdd] = useState("");
  const [stockToRemove, setStockToRemove] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("mitarbeiter");
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setData(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!selectedMemberId && data.members.length > 0) {
      setSelectedMemberId(data.members[0].id);
    }
  }, [data.members, selectedMemberId]);

  const totalOpen = useMemo(() => {
    return data.members.reduce((sum, member) => {
      const due = member.beers * data.pricePerBeer - member.paidAmount;
      return sum + Math.max(0, due);
    }, 0);
  }, [data]);

  const totalBeers = useMemo(() => {
    return data.members.reduce((sum, member) => sum + member.beers, 0);
  }, [data.members]);

  const currentMember = data.members.find((m) => m.id === selectedMemberId);

  const addBeer = (memberId) => {
    setData((prev) => ({
      ...prev,
      stock: Math.max(0, prev.stock - 1),
      members: prev.members.map((member) =>
        member.id === memberId ? { ...member, beers: member.beers + 1 } : member
      ),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: "beer",
          memberId,
          amount: prev.pricePerBeer,
          text: "1 Bier hinzugefügt",
          date: todayDateTime(),
        },
        ...prev.transactions,
      ],
    }));
  };

  const removeBeer = (memberId) => {
    const member = data.members.find((m) => m.id === memberId);
    if (!member || member.beers <= 0) return;

    setData((prev) => ({
      ...prev,
      stock: prev.stock + 1,
      members: prev.members.map((m) =>
        m.id === memberId ? { ...m, beers: Math.max(0, m.beers - 1) } : m
      ),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: "correction",
          memberId,
          amount: -prev.pricePerBeer,
          text: "1 Bier entfernt",
          date: todayDateTime(),
        },
        ...prev.transactions,
      ],
    }));
  };

  const markPaid = (memberId) => {
    setData((prev) => {
      const member = prev.members.find((m) => m.id === memberId);
      if (!member) return prev;

      const totalDue = member.beers * prev.pricePerBeer;
      const payment = Math.max(0, totalDue - member.paidAmount);

      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? { ...m, paidAmount: totalDue } : m
        ),
        transactions: [
          {
            id: crypto.randomUUID(),
            type: "payment",
            memberId,
            amount: payment,
            text: "Als bezahlt markiert",
            date: todayDateTime(),
          },
          ...prev.transactions,
        ],
      };
    });
  };

  const resetMember = (memberId) => {
    setData((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.id === memberId ? { ...m, beers: 0, paidAmount: 0 } : m
      ),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: "reset",
          memberId,
          amount: 0,
          text: "Konto zurückgesetzt",
          date: todayDateTime(),
        },
        ...prev.transactions,
      ],
    }));
  };

  const addMember = () => {
    const name = newMemberName.trim();
    if (!name) return;

    const newMember = { id: crypto.randomUUID(), name, beers: 0, paidAmount: 0 };
    setData((prev) => ({ ...prev, members: [...prev.members, newMember] }));
    setNewMemberName("");
    setSelectedMemberId(newMember.id);
  };

  const deleteMember = (memberId) => {
    setData((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== memberId),
      transactions: prev.transactions.filter((t) => t.memberId !== memberId),
    }));
  };

  const addStock = () => {
    const value = Number(stockToAdd);
    if (!Number.isFinite(value) || value <= 0) return;

    setData((prev) => ({
      ...prev,
      stock: prev.stock + value,
      transactions: [
        {
          id: crypto.randomUUID(),
          type: "stock",
          amount: 0,
          text: `Bestand um ${value} erhöht`,
          date: todayDateTime(),
        },
        ...prev.transactions,
      ],
    }));

    setStockToAdd("");
  };

  const removeStock = () => {
    const value = Number(stockToRemove);
    if (!Number.isFinite(value) || value <= 0) return;

    setData((prev) => ({
      ...prev,
      stock: Math.max(0, prev.stock - value),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: "stock",
          amount: 0,
          text: `Bestand um ${Math.min(value, prev.stock)} reduziert`,
          date: todayDateTime(),
        },
        ...prev.transactions,
      ],
    }));

    setStockToRemove("");
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdminAuth(true);
      setAdminPasswordInput("");
    } else {
      alert("Falsches Passwort");
    }
  };

  const copyTwint = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(TWINT_NUMBER);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = TWINT_NUMBER;
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
      alert(`Bitte Nummer manuell kopieren: ${TWINT_NUMBER}`);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <h1>Bierkasse</h1>
            <p className="subtitle">Einfache interne Web-App für den Betrieb</p>
          </div>

          <div className="card twint-box">
            <div className="twint-label">TWINT</div>
            <div className="twint-row">
              <strong>{TWINT_NUMBER}</strong>
              <button className="btn btn-outline" onClick={copyTwint}>
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard title="Preis pro Bier" value={formatCHF(data.pricePerBeer)} />
          <StatCard title="Mitglieder" value={String(data.members.length)} />
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
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>

              {currentMember ? (
                <div className="member-box">
                  <div className="member-header">
                    <h3>{currentMember.name}</h3>
                    <span className="badge">{currentMember.beers} Bier</span>
                  </div>

                  <div className="mini-grid">
                    <MiniInfo
                      label="Offen"
                      value={formatCHF(
                        Math.max(
                          0,
                          currentMember.beers * data.pricePerBeer - currentMember.paidAmount
                        )
                      )}
                    />
                    <MiniInfo label="Bezahlt" value={formatCHF(currentMember.paidAmount)} />
                    <MiniInfo
                      label="Total"
                      value={formatCHF(currentMember.beers * data.pricePerBeer)}
                    />
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
                <div className="muted">Aktueller Bestand</div>
                <div className="big-number">{data.stock}</div>
                <div className="muted">Flaschen / Dosen</div>
              </div>

              <div className="info-box">
                <div className="muted">TWINT an</div>
                <div className="big-text">{TWINT_NUMBER}</div>
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
                    <button className="btn btn-outline" onClick={() => setIsAdminAuth(false)}>
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
                    {data.members.map((member) => {
                      const total = member.beers * data.pricePerBeer;
                      const open = Math.max(0, total - member.paidAmount);

                      return (
                        <div key={member.id} className="list-item">
                          <div>
                            <div className="member-name">{member.name}</div>
                            <div className="muted">
                              {member.beers} Bier · Total {formatCHF(total)} · Offen{" "}
                              {formatCHF(open)}
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
                    <h2>Einstellungen</h2>
                    <label className="label">Preis pro Bier (CHF)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      value={data.pricePerBeer}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          pricePerBeer: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>

                  <div className="card">
                    <h2>Bestand verwalten</h2>

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
                      Die Daten werden lokal im Browser gespeichert. Für einen echten
                      Mehrbenutzer-Betrieb bräuchte es später eine zentrale Datenbank.
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

            {data.transactions.length === 0 ? (
              <p className="muted">Noch keine Einträge vorhanden.</p>
            ) : (
              <div className="list">
                {data.transactions.map((entry) => {
                  const member = data.members.find((m) => m.id === entry.memberId);

                  return (
                    <div key={entry.id} className="list-item">
                      <div>
                        <div className="member-name">
                          {entry.text}
                          {member ? ` · ${member.name}` : ""}
                        </div>
                        <div className="muted">{entry.date}</div>
                      </div>
                      <div className="badge">
                        {entry.type === "payment"
                          ? `+ ${formatCHF(entry.amount)}`
                          : entry.type === "beer"
                          ? `${formatCHF(entry.amount)}`
                          : entry.amount !== 0
                          ? `${formatCHF(entry.amount)}`
                          : "Info"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}