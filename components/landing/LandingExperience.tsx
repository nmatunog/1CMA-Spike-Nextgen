"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DNA_QUIZ_QUESTIONS } from "@/lib/landing/dna-quiz-questions";

type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string;
  score: number;
  created_at: string;
};

export function LandingExperience() {
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [notif, setNotif] = useState<{ show: boolean; text: string }>({
    show: false,
    text: "",
  });
  const [quizOpen, setQuizOpen] = useState(false);
  const [regVisible, setRegVisible] = useState(true);
  const [quizVisible, setQuizVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [candidateInfo, setCandidateInfo] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [dnaScore, setDnaScore] = useState(0);
  const [resultMessage, setResultMessage] = useState("");
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminViewOpen, setAdminViewOpen] = useState(false);
  const [mainHidden, setMainHidden] = useState(false);
  const [candidatesData, setCandidatesData] = useState<Candidate[]>([]);
  const [sortAsc, setSortAsc] = useState(false);

  const showNotif = useCallback((text: string) => {
    setNotif({ show: true, text });
    setTimeout(() => setNotif((n) => ({ ...n, show: false })), 3000);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoaderVisible(false), 500);
    return () => clearTimeout(t);
  }, []);

  const openQuiz = () => {
    setCurrentStep(0);
    setTotalScore(0);
    setCandidateInfo({ name: "", email: "", phone: "" });
    setQuizOpen(true);
    setRegVisible(true);
    setQuizVisible(false);
    setResultVisible(false);
  };

  const closeQuiz = () => setQuizOpen(false);

  const startActualQuiz = () => {
    const { name, email, phone } = candidateInfo;
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      showNotif("Please complete your details!");
      return;
    }
    setCurrentStep(0);
    setTotalScore(0);
    setRegVisible(false);
    setQuizVisible(true);
  };

  const finishQuiz = async (score: number) => {
    setQuizVisible(false);
    setResultVisible(true);
    const percentage = Math.min(100, Math.round((score / 100) * 100));
    setDnaScore(percentage);
    if (percentage >= 80) {
      setResultMessage(
        "You're a natural leader! Your mindset is perfectly aligned with the Next Gen Advisor path.",
      );
    } else if (percentage >= 50) {
      setResultMessage(
        "You have massive potential. SPIKE is your perfect starting point.",
      );
    } else {
      setResultMessage(
        "You're curious and ready for growth. Let's explore your future.",
      );
    }

    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidateInfo.name.trim(),
          email: candidateInfo.email.trim(),
          phone: candidateInfo.phone.trim(),
          score: percentage,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        console.error("Save Error:", data.error ?? res.statusText);
        showNotif("Could not save result — check DATABASE_URL (Supabase Postgres).");
      } else {
        showNotif("DNA Profile Captured!");
      }
    } catch (e) {
      console.error("Save Error:", e);
      showNotif("Could not save result — network or DATABASE_URL.");
    }
  };

  const renderQuestion = () => {
    const data = DNA_QUIZ_QUESTIONS[currentStep];
    if (!data) return null;
    const pct = ((currentStep + 1) / DNA_QUIZ_QUESTIONS.length) * 100;
    return (
      <>
        <div className="mb-10 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="progress-bar h-full bg-[#D31145] shadow-[0_0_12px_rgba(211,17,69,0.7)] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mb-8 text-2xl font-bold leading-tight text-white [text-shadow:0_4px_15px_rgba(0,0,0,0.9)]">
          {data.q}
        </p>
        <div className="space-y-4">
          {data.options.map((opt) => (
            <button
              key={opt.t}
              type="button"
              className="w-full rounded-2xl border border-white/20 p-5 text-left font-bold text-white transition-all hover:border-[#ff4d4d] hover:bg-white/10 active:scale-[0.98]"
              onClick={() => {
                const next = totalScore + opt.v;
                setTotalScore(next);
                if (currentStep < DNA_QUIZ_QUESTIONS.length - 1) {
                  setCurrentStep((s) => s + 1);
                } else {
                  void finishQuiz(next);
                }
              }}
            >
              {opt.t}
            </button>
          ))}
        </div>
      </>
    );
  };

  const validateAdmin = async () => {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPass }),
    });
    if (!res.ok) {
      showNotif("Incorrect access key");
      return;
    }
    setAdminLoginOpen(false);
    setAdminPass("");
    await loadAdminConsole();
  };

  const loadAdminConsole = async () => {
    setMainHidden(true);
    setAdminViewOpen(true);
    const res = await fetch("/api/admin/candidates");
    if (!res.ok) {
      showNotif("Dashboard access error");
      return;
    }
    const json = (await res.json()) as { candidates?: Candidate[] };
    const list = json.candidates ?? [];
    list.sort((a, b) => b.score - a.score);
    setCandidatesData(list);
  };

  const exitAdmin = () => {
    setAdminViewOpen(false);
    setMainHidden(false);
  };

  const sortCandidates = () => {
    const next = !sortAsc;
    setSortAsc(next);
    setCandidatesData((prev) =>
      [...prev].sort((a, b) => (next ? a.score - b.score : b.score - a.score)),
    );
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const deleteCandidate = async (id: string, name: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    const res = await fetch(`/api/admin/candidates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showNotif("Delete failed");
      return;
    }
    showNotif(`Deleted ${name}`);
    void loadAdminConsole();
    setDeleteConfirmId(null);
  };

  const toggleCard = (el: HTMLElement) => {
    document.querySelectorAll(".step-node").forEach((node) => {
      if (node !== el) {
        node.classList.remove("active", "border-l-4", "border-l-[#D31145]");
      }
    });
    el.classList.toggle("active");
    if (el.classList.contains("active")) {
      el.classList.add("border-l-4", "border-l-[#D31145]");
    }
  };

  return (
    <div className="overflow-x-hidden bg-[#0f172a] font-sans text-white">
      <div
        className={`fixed inset-0 z-[999] flex items-center justify-center bg-[#0f172a] transition-opacity duration-500 ${loaderVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#D31145] border-t-transparent" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Initializing Next Gen...
          </p>
        </div>
      </div>

      <div
        className={`fixed bottom-8 right-8 z-[100] transition-transform duration-300 ${notif.show ? "translate-y-0" : "translate-y-[150%]"}`}
      >
        <div className="glass rounded-2xl border border-white/15 px-6 py-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <p className="text-sm font-bold text-white">{notif.text}</p>
        </div>
      </div>

      <div className={mainHidden ? "hidden" : ""}>
        <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="absolute inset-0 z-0 opacity-25">
            <svg
              viewBox="0 0 200 200"
              xmlns="http://www.w3.org/2000/svg"
              className="h-full w-full"
              aria-hidden
            >
              <path
                fill="#D31145"
                d="M44.7,-76.4C58.1,-69.2,69.5,-57.4,76.4,-43.8C83.3,-30.2,85.7,-15.1,84.1,-0.9C82.5,13.3,77,26.5,69.5,39.1C62,51.7,52.5,63.6,40.1,71.5C27.7,79.4,13.8,83.3,-0.7,84.5C-15.2,85.7,-30.4,84.1,-43.6,77.2C-56.8,70.3,-68,58.2,-75.9,44.4C-83.8,30.6,-88.4,15.3,-88.1,0.2C-87.8,-14.9,-82.6,-29.8,-74.1,-42.6C-65.6,-55.4,-53.8,-66.1,-40.5,-73.5C-27.2,-80.9,-13.6,-85,0.8,-86.3C15.2,-87.6,31.3,-83.6,44.7,-76.4Z"
                transform="translate(100 100)"
              />
            </svg>
          </div>
          <div className="z-10 max-w-4xl">
            <h1 className="mb-6 text-5xl font-extrabold leading-tight text-white [text-shadow:0_4px_15px_rgba(0,0,0,0.9)] md:text-8xl">
              <span className="text-white">Stop Trading Time.</span> <br />
              <span className="inline-block bg-gradient-to-r from-[#ff5f6d] to-[#ffd93d] bg-clip-text text-transparent [filter:drop-shadow(0_0_15px_rgba(255,95,109,0.5))]">
                Build Your Empire.
              </span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-xl font-medium text-slate-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
              Join the AIA Next Gen Advisor program. The only career path designed
              to give you CEO freedom with a VC-style safety net.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="#pathway"
                className="rounded-full bg-[#D31145] px-8 py-4 text-lg font-bold shadow-lg shadow-red-500/40 transition-all hover:bg-red-700"
              >
                See the Roadmap
              </a>
              <button
                type="button"
                onClick={openQuiz}
                className="rounded-full border border-white/30 bg-white/5 px-8 py-4 text-lg font-bold backdrop-blur-xl transition-all hover:bg-white/10"
              >
                Discover Your DNA Match
              </button>
            </div>
            <p className="mt-10 text-sm text-slate-400">
              <Link href="/onboarding" className="text-[#00a9ce] underline-offset-4 hover:underline">
                Continue to region &amp; chat
              </Link>
            </p>
          </div>
        </section>

        <section id="pathway" className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="mb-4 text-center text-3xl font-bold text-white">
            The Career Roadmap
          </h2>
          <p className="mb-16 text-center italic font-medium text-slate-200">
            Click a stage to expand details
          </p>

          <div
            className="step-node active relative mb-4 cursor-pointer rounded-3xl border border-white/15 bg-[rgba(7,11,20,0.85)] p-8 backdrop-blur-xl transition-all duration-300 border-l-4 border-l-[#D31145]"
            onClick={(e) => toggleCard(e.currentTarget)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggleCard(e.currentTarget as unknown as HTMLElement);
            }}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-start gap-6">
                <div className="shrink-0 rounded-2xl bg-red-500/20 p-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff4d4d" strokeWidth="2.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-[#ff4d4d]">
                    Level 01
                  </span>
                  <h3 className="text-2xl font-bold text-white">SPIKE Internship</h3>
                </div>
              </div>
              <svg className="chevron h-6 w-6 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="expand-content mt-6 border-t border-white/20 pt-4">
              <p className="mb-4 font-medium text-white">
                <strong>SPIKE:</strong> Special Program for Internship and Knowledge Enhancement.
              </p>
              <ul className="space-y-3 text-sm font-medium text-slate-100">
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#ff4d4d]" />
                  6-Week professional development track.
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#ff4d4d]" />
                  Expert handholding &amp; training through the IC Licensing process.
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#ff4d4d]" />
                  Smooth onboarding with personal mentorship from Day 1.
                </li>
              </ul>
            </div>
          </div>

          <div className="connector mx-auto h-10 w-[3px] bg-gradient-to-b from-[#D31145] to-[#1e293b]" />

          <div
            className="step-node mb-4 cursor-pointer rounded-3xl border border-white/15 bg-[rgba(7,11,20,0.85)] p-8 backdrop-blur-xl transition-all duration-300 hover:border-[rgba(211,17,69,0.6)] hover:bg-[rgba(211,17,69,0.08)]"
            onClick={(e) => toggleCard(e.currentTarget)}
            role="button"
            tabIndex={0}
          >
            <div className="flex w-full items-center justify-between">
                <div className="flex items-start gap-6">
                <div className="shrink-0 rounded-2xl bg-[#D31145] p-4 shadow-lg shadow-red-500/30">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-white">
                    Level 02
                  </span>
                  <h3 className="text-2xl font-bold text-white">Next Gen Advisor (NGA)</h3>
                </div>
              </div>
              <svg className="chevron h-6 w-6 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="expand-content border-t border-white/20 pt-4">
              <p className="mb-4 font-medium text-white">
                <strong>NGA:</strong> Your professional startup launchpad.
              </p>
              <ul className="space-y-3 text-sm font-medium text-slate-100">
                <li className="flex items-center gap-3 font-bold text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  Monthly Cash Subsidies (Development Fund)
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#D31145]" />
                  Commissions + Performance Bonuses + Tech Incentives.
                </li>
              </ul>
            </div>
          </div>

          <div className="connector mx-auto h-10 w-[3px] bg-gradient-to-b from-[#D31145] to-[#1e293b]" />

          <div
            className="step-node mb-4 cursor-pointer rounded-3xl border border-white/15 bg-[rgba(7,11,20,0.85)] p-8 backdrop-blur-xl transition-all duration-300 hover:border-[rgba(211,17,69,0.6)] hover:bg-[rgba(211,17,69,0.08)]"
            onClick={(e) => toggleCard(e.currentTarget)}
            role="button"
            tabIndex={0}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-start gap-6">
                <div className="shrink-0 rounded-2xl bg-yellow-500/20 p-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f9cb28" strokeWidth="2.5">
                    <circle cx="12" cy="8" r="7" />
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                  </svg>
                </div>
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-yellow-500">
                    Level 03
                  </span>
                  <h3 className="text-2xl font-bold text-white">Agency Leader (AL)</h3>
                </div>
              </div>
              <svg className="chevron h-6 w-6 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="expand-content border-t border-white/20 pt-4">
              <p className="mb-4 font-medium text-white">
                Build your own organization and scale your impact.
              </p>
              <ul className="space-y-3 text-sm font-medium text-slate-100">
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  Recruit and mentor your own &quot;Next Gen&quot; team.
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  Overriding commissions &amp; sustainable passive income.
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  CEO Status with world-class recognition.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="relative bg-[#D31145] py-24 text-white">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="mb-4 text-4xl font-extrabold uppercase italic tracking-tight text-white [text-shadow:0_4px_15px_rgba(0,0,0,0.9)] md:text-5xl">
              The Reward
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                { emoji: "💰", title: "Subsidies", desc: "Monthly cash support to fuel your business growth." },
                { emoji: "🏆", title: "Bonuses", desc: "Performance incentives that reward your hustle." },
                { emoji: "✈️", title: "Lifestyle", desc: "Global travel and world-class recognition." },
              ].map((x) => (
                <div
                  key={x.title}
                  className="transform rounded-[2rem] border border-white/20 bg-black/20 p-8 backdrop-blur-md transition-all hover:scale-105"
                >
                  <div className="mb-4 text-5xl">{x.emoji}</div>
                  <h3 className="mb-3 text-xl font-bold uppercase">{x.title}</h3>
                  <p className="font-bold">{x.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="connect" className="px-6 py-32 text-center">
          <h2 className="mb-4 text-4xl font-extrabold text-white [text-shadow:0_4px_15px_rgba(0,0,0,0.9)] md:text-5xl">
            Vibe Check: Start Here
          </h2>
          <p className="mb-12 text-lg font-medium text-slate-300">
            Ready to see if your DNA matches the AIA Next Gen profile?
          </p>
          <div className="mx-auto max-w-xs">
            <button
              type="button"
              onClick={openQuiz}
              className="w-full transform rounded-2xl border border-white/10 bg-[#D31145] px-10 py-6 text-2xl font-extrabold tracking-tight text-white shadow-2xl shadow-red-500/40 transition-all hover:scale-105 hover:bg-red-700 active:scale-95"
            >
              Discover Your DNA Match
            </button>
          </div>
        </section>

        <footer className="border-t border-white/10 py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-300">
          © {new Date().getFullYear()} AIA Philippines •{" "}
          <button
            type="button"
            onClick={() => setAdminLoginOpen(true)}
            className="underline transition-colors hover:text-white"
          >
            Admin Console
          </button>
        </footer>
      </div>

      {adminLoginOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/98 p-4">
          <div className="w-full max-w-md rounded-[2rem] border border-white/30 bg-[rgba(7,11,20,0.85)] p-8 text-center shadow-2xl backdrop-blur-xl">
            <h3 className="mb-4 text-2xl font-bold text-white">Admin Access</h3>
            <input
              type="password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="Enter Code"
              className="mb-6 w-full rounded-xl border border-white/20 bg-white/5 p-4 text-center text-2xl tracking-widest text-white outline-none"
            />
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setAdminLoginOpen(false);
                  setAdminPass("");
                }}
                className="w-1/2 rounded-xl bg-white/10 py-3 font-bold text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void validateAdmin()}
                className="w-1/2 rounded-xl bg-[#D31145] py-3 font-bold text-white"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      )}

      {adminViewOpen && (
        <div className="min-h-screen p-6 md:p-12">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-baseline gap-4">
                <h2 className="text-3xl font-bold text-white">Candidate Dashboard</h2>
                <span className="rounded-full bg-[#D31145] px-3 py-1 text-xs font-bold text-white">
                  {candidatesData.length} Respondent
                  {candidatesData.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={exitAdmin}
                className="rounded-xl bg-white/10 px-6 py-2 font-bold text-white hover:bg-white/20"
              >
                Exit Console
              </button>
            </div>
            <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-[rgba(7,11,20,0.85)] backdrop-blur-xl">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-widest text-slate-300">
                    <th className="p-6">Name</th>
                    <th className="p-6">Contact Info</th>
                    <th className="p-6">
                      <button type="button" onClick={sortCandidates} className="hover:text-white">
                        Score (%) ↕
                      </button>
                    </th>
                    <th className="p-6">Time</th>
                    <th className="p-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {candidatesData.map((c) => (
                    <tr key={c.id}>
                      <td className="p-6 font-bold text-white">{c.name}</td>
                      <td className="p-6 text-slate-400">
                        <div className="text-white">{c.email}</div>
                        <div className="text-xs font-bold">{c.phone}</div>
                      </td>
                      <td className="p-6 text-lg font-extrabold text-[#ff4d4d]">{c.score}%</td>
                      <td className="p-6 text-xs font-medium text-slate-500">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-6 text-right">
                        <button
                          type="button"
                          onClick={() => void deleteCandidate(c.id, c.name)}
                          className={`rounded-lg border border-white/10 px-4 py-2 text-xs font-bold transition-all ${
                            deleteConfirmId === c.id
                              ? "bg-red-600 text-white"
                              : "bg-white/5 text-slate-400 hover:bg-red-600/20 hover:text-red-500"
                          }`}
                        >
                          {deleteConfirmId === c.id ? "Confirm?" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {quizOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 p-4">
          <div className="relative w-full max-w-xl rounded-[2.5rem] border border-white/30 bg-[rgba(7,11,20,0.85)] p-8 shadow-2xl backdrop-blur-xl md:p-10">
            <button
              type="button"
              onClick={closeQuiz}
              className="absolute right-6 top-6 text-2xl font-bold text-white hover:text-red-500"
              aria-label="Close"
            >
              ✕
            </button>
            {regVisible && (
              <div>
                <h3 className="mb-2 text-2xl font-bold text-white">Vibe Check: Start Here</h3>
                <p className="mb-8 font-medium text-slate-200">
                  Tell us who you are before starting the 30s DNA quiz.
                </p>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={candidateInfo.name}
                    onChange={(e) =>
                      setCandidateInfo((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/20 bg-white/5 p-4 text-white outline-none focus:border-[#D31145]"
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={candidateInfo.email}
                    onChange={(e) =>
                      setCandidateInfo((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/20 bg-white/5 p-4 text-white outline-none focus:border-[#D31145]"
                  />
                  <input
                    type="tel"
                    placeholder="Mobile Number (Viber)"
                    value={candidateInfo.phone}
                    onChange={(e) =>
                      setCandidateInfo((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/20 bg-white/5 p-4 text-white outline-none focus:border-[#D31145]"
                  />
                  <button
                    type="button"
                    onClick={startActualQuiz}
                    className="mt-4 w-full rounded-2xl bg-[#D31145] py-4 text-lg font-bold tracking-tight text-white shadow-lg shadow-red-500/30"
                  >
                    Reveal My DNA Match
                  </button>
                </div>
              </div>
            )}
            {quizVisible && (
              <div>
                {currentStep < DNA_QUIZ_QUESTIONS.length && renderQuestion()}
              </div>
            )}
            {resultVisible && (
              <div className="py-4 text-center">
                <div className="animate-landing-float mb-8 text-6xl">🚀</div>
                <h4 className="mb-4 text-4xl font-extrabold text-white">
                  DNA Match:{" "}
                  <span className="text-[#ff4d4d]">{dnaScore}%</span>
                </h4>
                <p className="mb-10 px-4 text-lg font-medium leading-relaxed text-white">
                  {resultMessage}
                </p>
                <button
                  type="button"
                  onClick={closeQuiz}
                  className="w-full rounded-2xl bg-white/10 py-5 text-xl font-extrabold text-white hover:bg-white/20"
                >
                  Back to Roadmap
                </button>
                <p className="mt-6 text-sm text-slate-400">
                  <Link href="/onboarding" className="text-[#00a9ce] underline">
                    Set region &amp; open chat
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .step-node .expand-content {
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height 0.4s ease-out, opacity 0.3s ease;
        }
        .step-node.active .expand-content {
          max-height: 600px;
          opacity: 1;
          margin-top: 1.5rem;
        }
        .step-node.active .chevron {
          transform: rotate(180deg);
        }
        .step-node.active {
          border-color: rgba(211, 17, 69, 0.6);
          background: rgba(211, 17, 69, 0.08);
        }
        @keyframes landing-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-landing-float {
          animation: landing-float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
