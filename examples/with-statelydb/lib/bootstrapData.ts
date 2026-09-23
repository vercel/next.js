"use server";

import { statelyClient } from "./stately";
// Note: keyPath not required here because we rely on client auto keying when creating.

// Types for bootstrap mock data (kept local to server so large data isn't sent to client bundle)
interface ChannelSeed { name: string; description: string; }
interface ShowSeed { title: string; description: string; year: string; }
interface CharacterSeed { name: string; role: string; description: string; }
interface BootstrapMockData {
  channels: ChannelSeed[];
  shows: Record<string, ShowSeed[]>;
  characters: Record<string, CharacterSeed[]>;
}

function generateMockData(): BootstrapMockData {
  // (Copied from previous bootstrap page implementation)
  return {
    channels: [
      { name: "Action Network", description: "High-octane action series and explosive adventures" },
      { name: "Bright Comedy", description: "Laugh-out-loud comedies and sitcoms for every mood" },
      { name: "Crime Central", description: "Gripping crime dramas and detective mysteries" },
      { name: "Drama District", description: "Powerful dramatic series with compelling narratives" },
      { name: "Epic Tales", description: "Fantasy epics and legendary storytelling" },
      { name: "Future Vision", description: "Science fiction and futuristic adventures" },
      { name: "Historical Hub", description: "Period dramas and historical recreations" },
      { name: "Mystery Manor", description: "Suspenseful thrillers and whodunit mysteries" },
      { name: "Reality Realm", description: "Reality shows and documentary series" },
      { name: "Youth Zone", description: "Teen dramas and coming-of-age stories" },
    ],
    shows: {
      "Action Network": [
        { title: "Strike Force", description: "Elite operatives take on global threats in this high-stakes action series", year: "2023" },
        { title: "Highway Pursuit", description: "Fast cars and dangerous chases across the American highway system", year: "2024" },
        { title: "Urban Warriors", description: "Street fighters defend their neighborhood from organized crime", year: "2022" },
      ],
      "Bright Comedy": [
        { title: "Coffee Shop Chronicles", description: "A quirky barista navigates life and love in a Brooklyn café", year: "2023" },
        { title: "The Roommate Experiment", description: "Four strangers become unlikely friends in a shared apartment", year: "2024" },
        { title: "Office Antics", description: "Workplace comedy about a dysfunctional marketing team", year: "2022" },
        { title: "Family Matters Plus", description: "Extended family chaos meets modern life in this heartwarming sitcom", year: "2023" },
      ],
      "Crime Central": [
        { title: "Detective Files", description: "Veteran detective solves cold cases with cutting-edge forensics", year: "2023" },
        { title: "City of Shadows", description: "Noir-inspired crime drama set in a corrupt metropolis", year: "2024" },
        { title: "The Cartel", description: "Inside look at the drug trade from both sides of the law", year: "2022" },
      ],
      "Drama District": [
        { title: "Broken Trust", description: "A family empire crumbles under the weight of betrayal and secrets", year: "2023" },
        { title: "Hospital Hearts", description: "Medical drama following the lives of doctors and nurses", year: "2024" },
        { title: "The Advocate", description: "Passionate lawyer fights for justice in a broken legal system", year: "2023" },
        { title: "Coastal Lives", description: "Interconnected stories of residents in a small beach town", year: "2022" },
      ],
      "Epic Tales": [
        { title: "Kingdom of Ash", description: "Dragons, magic, and political intrigue in a medieval fantasy realm", year: "2023" },
        { title: "The Sorcerer's Apprentice", description: "Young mage discovers their destiny in a world of ancient magic", year: "2024" },
        { title: "Legends Reborn", description: "Heroes from myth awaken in the modern world", year: "2023" },
      ],
      "Future Vision": [
        { title: "Starship Odyssey", description: "Deep space exploration and first contact with alien civilizations", year: "2023" },
        { title: "Cyber Revolution", description: "Hackers fight corporate control in a dystopian future", year: "2024" },
        { title: "Time Paradox", description: "Time travelers attempt to prevent catastrophic timeline changes", year: "2022" },
      ],
      "Historical Hub": [
        { title: "Crown and Country", description: "Royal intrigue during the Tudor dynasty", year: "2023" },
        { title: "Revolutionary Spirits", description: "Personal stories from the American Revolution", year: "2024" },
        { title: "Silk Road Traders", description: "Merchant adventures along the ancient trade routes", year: "2023" },
        { title: "Victorian Mysteries", description: "Detective work in gaslit London streets", year: "2022" },
      ],
      "Mystery Manor": [
        { title: "The Vanishing", description: "Small town residents mysteriously disappear one by one", year: "2023" },
        { title: "Midnight Caller", description: "Anonymous tips lead a journalist into dangerous territory", year: "2024" },
        { title: "The Inheritance", description: "Family members gather for a will reading, but secrets emerge", year: "2023" },
      ],
      "Reality Realm": [
        { title: "Extreme Survival", description: "Contestants test their limits in harsh wilderness conditions", year: "2023" },
        { title: "Chef's Challenge", description: "Aspiring chefs compete for culinary supremacy", year: "2024" },
        { title: "Home Transformers", description: "Design experts renovate homes with stunning results", year: "2023" },
      ],
      "Youth Zone": [
        { title: "High School Diaries", description: "Teenagers navigate friendships, romance, and identity", year: "2023" },
        { title: "Summer Camp Secrets", description: "First love and self-discovery at a lakeside camp", year: "2024" },
        { title: "Band Together", description: "Teen musicians chase their dreams of making it big", year: "2023" },
        { title: "College Bound", description: "Students face the challenges of freshman year", year: "2024" },
      ],
    },
    characters: {
      "Strike Force": [
        { name: "Jack Reeves", role: "Team Leader", description: "Former Navy SEAL with unmatched tactical expertise" },
        { name: "Maya Chen", role: "Tech Specialist", description: "Brilliant hacker and cyber warfare expert" },
        { name: "Carlos Rivera", role: "Weapons Expert", description: "Master of all firearms and explosives" },
        { name: "Sarah Blake", role: "Intelligence Officer", description: "CIA analyst with photographic memory" },
      ],
      "Coffee Shop Chronicles": [
        { name: "Emma Walsh", role: "Lead Barista", description: "Aspiring artist balancing creativity and rent" },
        { name: "Marcus Johnson", role: "Regular Customer", description: "Writer who lives for caffeine and conversation" },
        { name: "Zoe Park", role: "Shop Owner", description: "Former corporate executive who left it all for coffee" },
        { name: "Tyler Brooks", role: "New Barista", description: "Music student working his way through college" },
        { name: "Rachel Green", role: "Customer", description: "Social media influencer and coffee connoisseur" },
      ],
      "Detective Files": [
        { name: "Detective Morgan Hayes", role: "Lead Detective", description: "Veteran investigator haunted by an unsolved case" },
        { name: "Dr. Lisa Park", role: "Forensic Specialist", description: "Medical examiner with unconventional methods" },
        { name: "Officer James Wilson", role: "Junior Detective", description: "Eager rookie with natural investigative instincts" },
        { name: "Captain Sandra Martinez", role: "Police Captain", description: "Tough but fair leader of the homicide division" },
      ],
      "Kingdom of Ash": [
        { name: "Queen Elara Stormborn", role: "Monarch", description: "Dragon rider and rightful heir to the throne" },
        { name: "Sir Gareth the Bold", role: "Knight", description: "Loyal warrior sworn to protect the queen" },
        { name: "Morgana Blackwood", role: "Sorceress", description: "Mysterious mage with hidden agenda" },
        { name: "Prince Daemon", role: "Antagonist", description: "Exiled prince seeking to reclaim his birthright" },
        { name: "Finn the Clever", role: "Thief", description: "Street-smart rogue with a heart of gold" },
        { name: "Elder Theron", role: "Advisor", description: "Ancient wizard and keeper of forbidden knowledge" },
      ],
      "Starship Odyssey": [
        { name: "Captain Helena Cross", role: "Ship Commander", description: "Fearless leader on humanity's first deep space mission" },
        { name: "Dr. Aiden Wu", role: "Chief Science Officer", description: "Xenobiologist fascinated by alien life" },
        { name: "Lieutenant Zara Okonkwo", role: "Pilot", description: "Ace pilot with nerves of steel" },
        { name: "NOVA", role: "AI", description: "Ship's artificial intelligence with developing consciousness" },
      ],
      "High School Diaries": [
        { name: "Alex Martinez", role: "Protagonist", description: "New student trying to find their place" },
        { name: "Jordan Kim", role: "Best Friend", description: "Loyal friend with a secret crush" },
        { name: "Taylor Reed", role: "Popular Kid", description: "Star athlete hiding vulnerability" },
        { name: "Morgan Lee", role: "Outcast", description: "Artistic loner who challenges the status quo" },
        { name: "Ms. Rodriguez", role: "Teacher", description: "Understanding counselor who makes a difference" },
      ],
    },
  };
}

/**
 * Bootstraps demo data if (and only if) there is currently no Channel in the store.
 * Returns true if seeding occurred, false if data already existed.
 */
export async function bootstrapData(): Promise<boolean> {
  // Quick existence check – scan for just one Channel
  const iter = statelyClient.beginScan({ itemTypes: ["Channel"] });
  for await (const item of iter) {
    if (statelyClient.isType(item, "Channel")) {
      return false; // Data already present
    }
  }

  const mockData = generateMockData();

  await statelyClient.transaction(async (txn) => {
    for (const channelData of mockData.channels) {
      const channelId = await txn.put(
        statelyClient.create("Channel", {
          name: channelData.name,
          description: channelData.description,
        })
      );

      const shows = mockData.shows[channelData.name] || [];
      for (const showData of shows) {
        const showId = await txn.put(
          statelyClient.create("Show", {
            channelId: channelId as Uint8Array,
            title: showData.title,
            description: showData.description,
            year: showData.year,
          })
        );

        const characters = mockData.characters[showData.title] || [];
        if (characters.length) {
          await txn.putBatch(
            ...characters.map((c) =>
              statelyClient.create("Character", {
                channelId: channelId as Uint8Array,
                showId: showId as Uint8Array,
                name: c.name,
                role: c.role,
                description: c.description,
              })
            )
          );
        }
      }
    }
  });

  return true;
}
