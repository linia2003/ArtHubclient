"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Card } from "@heroui/react";
import { authClient } from "@/lib/auth-client";

function UserDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveSubscriptionTier, setLiveSubscriptionTier] = useState(null);

  // PROFILE MANAGEMENT STATE MANAGEMENT
  const [newName, setNewName] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [profileMessage, setProfileMessage] = useState({ success: "", error: "" });
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const userEmail = session?.user?.email;
  const userName = session?.user?.name || "Collector";
  
  // Use liveSubscriptionTier fetched from DB — session does NOT carry subscriptionTier
  // because auth.js additionalFields only declares "role", not "subscriptionTier"
  const activeTier = liveSubscriptionTier || "free";

  useEffect(() => {
    if (!isPending) {
      if (!session || session?.user?.role !== "user") {
        window.location.href = "/login";
      } else {
        setNewName(session.user.name || "");
      }
    }
  }, [session, isPending]);

  // Fetch live subscriptionTier directly from DB — session doesn't carry it
  useEffect(() => {
    if (userEmail) {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      fetch(`${apiBaseUrl}/api/admin/users`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.users) {
            const me = data.users.find(
              (u) => u.email.toLowerCase() === userEmail.toLowerCase()
            );
            if (me?.subscriptionTier) setLiveSubscriptionTier(me.subscriptionTier);
          }
        })
        .catch(() => {});
    }
  }, [userEmail]);

  // After Stripe redirects back with ?purchase_success=true, call the confirm endpoint.
  // This is the reliable fallback since the Stripe webhook can't reach localhost in dev.
  useEffect(() => {
    const purchaseSuccess = searchParams.get("purchase_success");
    if (purchaseSuccess === "true" && userEmail) {
      const pending = sessionStorage.getItem("pending_artwork_purchase");
      if (pending) {
        try {
          const { artworkId, buyerName } = JSON.parse(pending);
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
          fetch(`${apiBaseUrl}/api/payment/confirm-purchase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ buyerEmail: userEmail, buyerName, artworkId }),
          })
            .then(() => {
              sessionStorage.removeItem("pending_artwork_purchase");
              // Clean the URL param then reload purchases
              router.replace("/dashboard/user");
            })
            .catch(() => sessionStorage.removeItem("pending_artwork_purchase"));
        } catch {
          sessionStorage.removeItem("pending_artwork_purchase");
        }
      }
    }
  }, [searchParams, userEmail]);

  // Sync historical purchase records and cross-verify missing visual assets
  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      
      // 1. Pull user transactions record histories
      fetch(`${apiBaseUrl}/api/user/purchases?email=${encodeURIComponent(userEmail)}`)
        .then((res) => res.json())
        .then(async (data) => {
          if (data.success && data.history) {
            const rawHistory = data.history;

            try {
              // 2. Fetch the entire catalog to reconstruct missing image URLs on older documents
              const artworksRes = await fetch(`${apiBaseUrl}/api/artworks`);
              const artworksData = await artworksRes.json();
              
              if (artworksData.success && artworksData.artworks) {
                const combinedHistory = rawHistory.map((tx) => {
                  // Find the matching artwork inside the global array
                  const match = artworksData.artworks.find((a) => a._id === tx.artworkId);
                  return {
                    ...tx,
                    // 🌟 FIX: Inject the original masterpiece URL directly if transactions table parameter was blank!
                    image: tx.image || match?.image || "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=500"
                  };
                });
                setPurchases(combinedHistory);
              } else {
                setPurchases(rawHistory);
              }
            } catch (err) {
              console.error("Error patching image metadata references:", err);
              setPurchases(rawHistory);
            }
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching user purchase logs:", err);
          setLoading(false);
        });
    }
  }, [userEmail]);

  // Stripe checkout generation handler
  const handleUpgrade = async (tierName, costAmount) => {
    if (!userEmail) return;
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiBaseUrl}/api/payment/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          tier: tierName,
          priceAmount: costAmount
        })
      });

      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.message || "Could not spin up payment portal instance.");
      }
    } catch (err) {
      console.error("❌ Error running upgrade pipeline session:", err);
    }
  };

  // PROFILE UPDATE ACTION: Modify Name via Better Auth Native Client
  const handleUpdateName = async (e) => {
    e.preventDefault();
    setProfileMessage({ success: "", error: "" });
    setUpdatingName(true);

    const { error } = await authClient.user.updateName({ name: newName });
    
    if (error) {
      setProfileMessage({ success: "", error: error.message || "Failed to update profile name." });
    } else {
      setProfileMessage({ success: "Name updated successfully! Reloading session profile...", error: "" });
      setTimeout(() => window.location.reload(), 1500);
    }
    setUpdatingName(false);
  };

  // PROFILE UPDATE ACTION: Modify Security Passwords safely
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setProfileMessage({ success: "", error: "" });
    setUpdatingPassword(true);

    const { error } = await authClient.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      setProfileMessage({ success: "", error: error.message || "Password adjustment transaction denied." });
    } else {
      setProfileMessage({ success: "Security password adjusted successfully!", error: "" });
      setPasswordForm({ currentPassword: "", newPassword: "" });
    }
    setUpdatingPassword(false);
  };

  if (isPending || !session || session?.user?.role !== "user") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white font-sans">
        <p className="text-lg font-semibold tracking-wide animate-pulse text-zinc-400">
          Verifying secure account credentials...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10 space-y-14 font-sans">
      
      {/* HEADER UTILITY */}
      <div>
        <h1 className="text-3xl font-black tracking-tight">User Operations Command</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Welcome back, {userName} — Account Membership Rank: <span className="text-orange-400 font-bold uppercase tracking-wider">{activeTier}</span>
        </p>
      </div>

      {/* SUBSCRIPTION PLAN MODULES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: "Free (Default)", limit: "3 Paintings", cost: "$0", keyName: "free" },
          { title: "Pro Upgrade", limit: "9 Paintings", cost: "$9.99/mo", keyName: "pro" },
          { title: "Premium VIP", limit: "Unlimited Paintings", cost: "$19.99/mo", keyName: "premium" },
        ].map((tier, i) => {
          const isCurrentlyActive = activeTier === tier.keyName;
          return (
            <div key={i} className={`p-6 rounded-2xl border flex flex-col justify-between ${isCurrentlyActive ? "border-orange-500 bg-orange-500/5" : "border-zinc-800 bg-zinc-900/20"}`}>
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg">{tier.title}</h3>
                  {isCurrentlyActive && <span className="text-xs bg-orange-500 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide animate-pulse">Active</span>}
                </div>
                <p className="text-2xl font-black mt-4 text-orange-400">{tier.cost}</p>
                <p className="text-zinc-500 text-xs mt-1">Limit Capacity: {tier.limit}</p>
              </div>
              
              {!isCurrentlyActive && (
                <Button 
                  size="sm" 
                  onClick={() => handleUpgrade(tier.keyName, tier.keyName === "pro" ? 9.99 : 19.99)}
                  className="w-full mt-6 bg-zinc-900 hover:bg-orange-600 border border-zinc-800 hover:border-orange-500 font-bold text-white rounded-xl transition-colors cursor-pointer"
                >
                  Upgrade via Stripe
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* BOUGHT ARTWORKS THUMBNAIL GALLERY VIEW */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Your Acquired Masterpiece Collection Gallery</h2>
          <p className="text-zinc-500 text-xs mt-0.5">Visual exhibition of high-fidelity canvas layouts you currently own.</p>
        </div>

        {loading ? (
          <div className="p-8 text-zinc-600 text-sm animate-pulse">Mapping collection thumbnail objects...</div>
        ) : purchases.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {purchases.map((art, index) => (
              <Card key={index} className="bg-zinc-950 border border-zinc-900 overflow-hidden rounded-xl group hover:border-zinc-700 transition-all">
                <div className="aspect-square w-full relative bg-zinc-900 overflow-hidden">
                  <img 
                    src={art.image} 
                    alt={art.artworkTitle} 
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-3 space-y-1">
                  <p className="font-bold text-sm text-white truncate">{art.artworkTitle}</p>
                  <p className="text-xs text-zinc-500">Acquired: {art.date ? new Date(art.date).toLocaleDateString() : "N/A"}</p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="p-12 border border-dashed border-zinc-800 bg-zinc-950/20 rounded-2xl text-center text-zinc-600 text-sm">
            No image canvas assets discovered in your collection directory files.
          </div>
        )}
      </div>

      {/* TRANSACTION RECORD TABLE */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Purchase Log Ledger</h2>
        <div className="w-full border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/20 backdrop-blur-md">
          <div className="grid grid-cols-12 bg-zinc-900/80 p-4 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
            <div className="col-span-6">Masterpiece Title</div>
            <div className="col-span-3">Price Paid</div>
            <div className="col-span-3 text-right">Transaction Timestamp</div>
          </div>
          <div className="divide-y divide-zinc-900">
            {purchases.length > 0 ? (
              purchases.map((tx, idx) => (
                <div key={idx} className="grid grid-cols-12 p-4 items-center text-sm hover:bg-zinc-900/30 transition-colors">
                  <div className="col-span-6 font-semibold text-white truncate pr-2">{tx.artworkTitle}</div>
                  <div className="col-span-3 text-orange-400 font-bold">${tx.amount}</div>
                  <div className="col-span-3 text-zinc-500 text-xs text-right">
                    {tx.date ? new Date(tx.date).toLocaleDateString() : "N/A"}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-zinc-500 text-sm">No historical purchases listed.</div>
            )}
          </div>
        </div>
      </div>

      {/* INTEGRATED PROFILE UTILITY SYSTEM */}
      <div className="space-y-4 border-t border-zinc-900 pt-10">
        <div>
          <h2 className="text-xl font-bold">Profile Identity Settings</h2>
          <p className="text-zinc-500 text-xs mt-0.5">Modify workspace operational display parameters and security credentials.</p>
        </div>

        {(profileMessage.success || profileMessage.error) && (
          <div className={`p-4 rounded-xl border text-sm font-bold text-center max-w-2xl ${
            profileMessage.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>
            {profileMessage.success || profileMessage.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
          <form onSubmit={handleUpdateName} className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Update Profile Name</h3>
            <Input label="Account Identity Username" value={newName} onChange={(e) => setNewName(e.target.value)} variant="bordered" required />
            <Button type="submit" size="sm" disabled={updatingName} className="bg-orange-500 font-bold text-white rounded-lg cursor-pointer">
              {updatingName ? "Saving changes..." : "Save Identity Name"}
            </Button>
          </form>

          <form onSubmit={handleUpdatePassword} className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Modify Security Password</h3>
            <Input label="Current Password" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})} variant="bordered" required />
            <Input label="New Secure Password" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})} variant="bordered" required />
            <Button type="submit" size="sm" disabled={updatingPassword} className="bg-zinc-900 border border-zinc-800 font-bold text-white rounded-lg cursor-pointer hover:bg-zinc-800">
              {updatingPassword ? "Processing hashing algorithms..." : "Modify Password"}
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
}

export default function UserDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-400">
        <p className="animate-pulse">Loading dashboard...</p>
      </div>
    }>
      <UserDashboard />
    </Suspense>
  );
}