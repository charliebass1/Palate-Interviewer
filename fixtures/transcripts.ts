// Three synthetic interviews covering distinct perspectives on the same
// research brief. Used by `npm run smoke` to exercise the full pipeline
// without placing a real Vapi call. Transcripts are intentionally
// opinionated and somewhat contradictory so the theme synthesizer has
// real clustering work to do.

export type SeedInterview = {
  expert_name: string;
  expert_role: string;
  expert_segment: string;
  duration_sec: number;
  transcript: string;
};

export const SEED_INTERVIEWS: SeedInterview[] = [
  {
    expert_name: "Marcus Hale",
    expert_role: "VP of Culinary, 140-unit regional burger chain (Southeast)",
    expert_segment: "operator",
    duration_sec: 1740,
    transcript: `Interviewer: Thanks for making time. Can you walk me through how a new LTO actually gets onto your menu — from first conversation to launch day?
Expert: Sure. Our cycle is 14 weeks end to end, which is tighter than most people think. Week one is culinary concepting — that's me and two R&D chefs. Week two we price it, which means I'm pulling case costs from three distributors and modeling menu economics at 28% food cost. Weeks three through six are sampling in three test stores. Weeks seven through ten we run it by franchisee council. Weeks eleven through fourteen is marketing, POP, training videos, and rollout.

Interviewer: Where do most concepts die in that cycle?
Expert: Honestly? Week seven. Franchisee council. I can have the best-tasting product on the planet, but if it needs a third prep station or a new piece of equipment, it dies there. Two years ago we had this phenomenal spicy honey chicken sandwich. Consumer testing 8.4 out of 10. Dead in franchisee council because it required a dedicated prep area for the honey glaze. Lost probably six weeks of work.

Interviewer: So labor and equipment are the silent killers. What about the supplier side — what separates a supplier that wins a slot from one that doesn't?
Expert: Three things. One, they show up with a sample, not a deck. I cannot stress this enough. I get 40 decks a quarter and I maybe look at three of them. A sample in my test kitchen gets ninety percent of the attention a deck gets zero. Two, they lock pricing for at least 12 months. We can't launch an LTO with volatile COGS, it breaks the financial model. Three — and this is underrated — they tell me which of my competitors is running the product. Not to copy, but because it means the product has survived a real operator's diligence.

Interviewer: Interesting. Say more about the competitive intel piece.
Expert: If a supplier walks in and says "Whataburger piloted this in Q3," I take the meeting. Not because I want to be second to Whataburger. Because I know their procurement is tight and if they cleared it, the product clears my bar too. It's a trust shortcut. Eighteen months ago no one was doing this. Now maybe one in five suppliers does. It will be table stakes within two years.

Interviewer: What about price locks — 12 months, 18 months?
Expert: 12 is the answer. 18 sounds better on paper but our own distributor contracts renegotiate every 12, so if a supplier locks 18 I can't actually commit 18 downstream. It creates a gap. 12 aligns.

Interviewer: Last one — do you still take rep visits?
Expert: From four suppliers, yes. Everyone else, email me a sample-drop address. The rep visit model is mostly theater at this point. The suppliers I still see in person are the ones with 20-year relationships, and honestly they don't need the visit either. It's vestigial.`,
  },

  {
    expert_name: "Priya Ramanathan",
    expert_role: "Regional Category Manager, national broadline distributor",
    expert_segment: "distributor",
    duration_sec: 1820,
    transcript: `Interviewer: You sit on the other side of the table from a lot of these operators. What does a supplier need to do to win shelf space with a regional burger chain in 2026?
Expert: The single biggest thing is that they need to understand the operator doesn't have budget to be experimental anymore. Five years ago I could walk a supplier in with a great story and some reasonable pricing and we'd get a pilot. Now the operator wants to see that the product has already been de-risked somewhere else. They want a reference customer — ideally a chain adjacency. That's new.

Interviewer: Is that the "which of my competitors is running this" dynamic?
Expert: Yes, exactly. Culinary leaders are asking that question directly now. It used to be a tell — if you wanted to know where a supplier had traction you'd read between the lines. Now operators ask on the first call.

Interviewer: What about the sample-first versus deck-first debate?
Expert: Sample always wins. But here's what people miss — the sample needs to arrive in a form the operator can actually use in their test kitchen. Frozen in case-pack configuration, with prep instructions that match their actual equipment. A lot of suppliers send a sample in a cooler with no prep card and wonder why it stalls. The sample is the pitch. If it takes their R&D chef twenty minutes to figure out how to cook it, the pitch has already failed.

Interviewer: Price locks — what are you seeing?
Expert: 12-month is standard, 18-month is a negotiation lever. Operators will ask for 18 to see if you'll blink. Give them 12 aligned with their distributor contract renewal and they're happy. If you give 18, you're eating volatility risk for free.

Interviewer: What about back-of-house constraints? How much of a filter is that?
Expert: Huge. Maybe the biggest filter. If a product needs a new prep step, a new holding unit, a new prep station — it dies. Operators will literally tell you: "If it doesn't fit in the flow, I can't run it, I don't care how good it tastes." The smart suppliers are building products specifically to drop into an existing station. One more SKU, same equipment, same two-step prep. That's the recipe.

Interviewer: Is there a flag you wave when a supplier is about to make a mistake?
Expert: Two actually. One — if they talk about their brand heritage for more than 90 seconds. The operator does not care, the operator's customer will never see the supplier brand. Two — if they won't put a 12-month price in writing. That's a deal killer now; they'll find out when the operator goes to the next supplier who will.

Interviewer: Chicken as a beef-LTO alternative — is that thesis playing out?
Expert: Partially. Chicken is absolutely growing mix. But I'd be cautious about positioning a premium chicken product as an alternative to beef LTOs — operators see those as separate menu architectures. It's more likely the winning play is just "premium chicken LTO, period" without trying to replace the beef slot.`,
  },

  {
    expert_name: "Danielle Okafor",
    expert_role: "Franchisee council chair, 60-unit Midwest burger chain",
    expert_segment: "operator",
    duration_sec: 1670,
    transcript: `Interviewer: You sit on the franchisee council — the group that, as I understand it, kills a lot of LTOs. What does the veto process actually look like?
Expert: It's less dramatic than people make it out to be. We meet every six weeks. Corporate brings us three to five concepts. We look at four things: labor impact, equipment impact, training complexity, and whether it fits the brand. Anything that requires more than thirty minutes of additional training per shift gets voted down immediately. We've been burned too many times by products that LOOKED simple and required an hour of training per team member.

Interviewer: Where does corporate culinary and the franchisees most often disagree?
Expert: Corporate culinary optimizes for the plate. Franchisees optimize for the shift. You can make something taste incredible, but if it adds two minutes to ticket time during the lunch rush, it is going to destroy our throughput and our margins. Corporate sometimes forgets that a 2% mix increase means nothing if drive-thru times go up 15 seconds.

Interviewer: Does that mean chicken LTOs are easier or harder than beef?
Expert: Easier, usually. Chicken sits in an existing fryer bay, most of the time. Beef LTOs often want a new patty size or a new cook temp, which means recalibrating grills across 60 stores. That's a nightmare. If a supplier walked in with a premium chicken patty that drops into the existing fryer protocol, we'd vote yes much more often than a beef LTO of equivalent quality.

Interviewer: What's your take on the "sample-first, deck-second" trend?
Expert: I never see the samples. That's a culinary conversation. What I see is the training guide, the equipment spec, and the labor model. If those three are clean, we vote yes. If the equipment spec has an asterisk anywhere, it's a no.

Interviewer: Competitive intel — does it come up in your council meetings?
Expert: Not really. By the time it gets to us, culinary has already screened for that. We're just evaluating operational fit. Though — and this is interesting — when we do hear that a larger competitor is running a product, it actually makes us MORE skeptical. Because a big chain's supply chain can absorb complexity we can't. So "Whataburger ran this" reads as "this probably doesn't fit us" in a 60-unit context.

Interviewer: That contradicts what I've been hearing from directors of culinary.
Expert: Yeah. We disagree with them openly. They want the de-risking signal; we want proof it works at our scale. A supplier that says "this ran successfully in a 40-unit Texas chain" is more persuasive to us than "this ran at Whataburger." Scale match matters.

Interviewer: Anything else suppliers get wrong?
Expert: They show up assuming the decision is made by one person. It's not. It's made by culinary, approved by operations, ratified by us, and then launched by marketing. Four groups. A supplier who only understands the culinary side gets blindsided at council 80% of the time.`,
  },
];
