"use client"
import Head from "next/head";
import { useAmp } from "next/amp";
import Layout from "../components/Layout";
import Byline from "../components/Byline";

export const config = {
  amp: true,
};

export default function IndexPage() {
  const isAmp = useAmp();

  return (
    <Layout>
      <Head>
        <title>The Cat</title>
      </Head>
      <h1>The Cat (AMP-first Page)</h1>
      <Byline author="Dan Zajdband" />
      <p className="caption">Meowwwwwwww</p>
       {/* Static HTML fallback for AMP-like layout */}
       <div style={{ position: 'relative', width: '100%', paddingBottom: '66.91%' }}>
        <img
          alt="Mountains"
          src="https://amp.dev/static/inline-examples/images/mountains.webp"
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <p>
        Cat ipsum dolor <a href={isAmp ? "/dog?amp=1" : "/dog"}>sit amet</a>,
        eat grass, throw it back up but refuse to leave cardboard box or groom
        yourself 4 hours - checked, have your beauty sleep 18 hours - checked,
        be fabulous for the rest of the day - checked!. Hide from vacuum
        cleaner. Chirp at birds chew foot chase the pig around the house and
        meoooow!. Chase ball of string climb a tree, wait for a fireman jump to
        fireman then scratch his face claw drapes, for meow to be let in yet
        attack dog, run away and pretend to be victim meow loudly just to annoy
        owners. Touch water with paw then recoil in horror hide when guests come
        over, and tuxedo cats always looking dapper so has closed eyes but still
        sees you or a nice warm laptop for me to sit on pee in human's bed until
        he cleans the litter box. Steal the warm chair right after you get up
        cat not kitten around yet claws in your leg eat all the power cords.
        Lick sellotape curl into a furry donut immediately regret falling into
        bathtub or you call this cat food? and fall asleep on the washing
        machine. Purr for no reason hack up furballs and pelt around the house
        and up and down stairs chasing phantoms. If it smells like fish eat as
        much as you wish. Unwrap toilet paper chew iPad power cord white cat
        sleeps on a black shirt lick the other cats. Lounge in doorway mew. Has
        closed eyes but still sees you sleep on keyboard, so hunt anything that
        moves lick sellotape but slap owner's face at 5am until human fills food
        dish if it smells like fish eat as much as you wish. Meow to be let in
        find empty spot in cupboard and sleep all day and thug cat sit by the
        fire burrow under covers always hungry. Swat at dog hide when guests
        come over purrrrrr chew on cable so mark territory, yet howl on top of
        tall thing or find something else more interesting. Chase mice kitten is
        playing with dead mouse. Sit and stare if it fits, i sits. Mark
        territory damn that dog , but step on your keyboard while you're gaming
        and then turn in a circle put butt in owner's face human give me
        attention meow or eat and than sleep on your face. Friends are not food
        jump around on couch, meow constantly until given food, or walk on car
        leaving trail of paw prints on hood and windshield, and spread kitty
        litter all over house, going to catch the red dot today going to catch
        the red dot today. Jump off balcony, onto stranger's head.
      </p>
      <p>
        Meow to be let out damn that dog howl uncontrollably for no reason
        caticus cuteicus for play riveting piece on synthesizer keyboard. Meow
        loudly just to annoy owners the dog smells bad for eat the fat cats
        food, yet ignore the squirrels, you'll never catch them anyway cat
        snacks spread kitty litter all over house or hopped up on catnip. Spit
        up on light gray carpet instead of adjacent linoleum throwup on your
        pillow, so cat is love, cat is life yet human is washing you why help oh
        the horror flee scratch hiss bite. Chase mice. Swat turds around the
        house hide at bottom of staircase to trip human. Meowing non stop for
        food howl on top of tall thing. Shake treat bag pee in human's bed until
        he cleans the litter box missing until dinner time. Have secret plans
        climb a tree, wait for a fireman jump to fireman then scratch his face
        bleghbleghvomit my furball really tie the room together. Chase dog then
        run away purr shake treat bag spit up on light gray carpet instead of
        adjacent linoleum but dream about hunting birds. Hiss at vacuum cleaner
        milk the cow lay on arms while you're using the keyboard sleep in the
        bathroom sink. Stare at ceiling touch water with paw then recoil in
        horror or refuse to leave cardboard box. Paw at your fat belly plan
        steps for world domination for going to catch the red dot today going to
        catch the red dot today slap owner's face at 5am until human fills food
        dish scratch at the door then walk away for intrigued by the shower, but
        steal the warm chair right after you get up. Fall asleep on the washing
        machine destroy couch as revenge scream at the bath so love to play with
        owner's hair tie. Howl uncontrollably for no reason rub whiskers on bare
        skin act innocent. Cats making all the muffins lick butt and make a
        weird face meow all night having their mate disturbing sleeping humans
        human give me attention meow intently stare at the same spot. Sleep on
        dog bed, force dog to sleep on floor spot something, big eyes, big eyes,
        crouch, shake butt, prepare to pounce for wake up human for food at 4am
        or pooping rainbow while flying in a toasted bread costume in space
        sleep on keyboard put toy mouse in food bowl run out of litter box at
        full speed . Jump off balcony, onto stranger's head lick butt and make a
        weird face but go into a room to decide you didn't want to be in there
        anyway so then cats take over the world, pee in human's bed until he
        cleans the litter box and if it fits, i sits caticus cuteicus. Eats
        owners hair then claws head lounge in doorway, and hide when guests come
        over chase ball of string eat owner's food play riveting piece on
        synthesizer keyboard. Purrr purr little cat, little cat purr purr spit
        up on light gray carpet instead of adjacent linoleum kitty loves pigs
        yet damn that dog meow or walk on car leaving trail of paw prints on
        hood and windshield. Roll on the floor purring your whiskers off meow
        all night having their mate disturbing sleeping humans need to chase
        tail meow hide when guests come over. Soft kitty warm kitty little ball
        of furr destroy the blinds meow leave hair everywhere attack dog, run
        away and pretend to be victim. Going to catch the red dot today going to
        catch the red dot today instantly break out into full speed gallop
        across the house for no reason meow so hide when guests come over, yet
        hide at bottom of staircase to trip human toy mouse squeak roll over
        claws in your leg. Cat slap dog in face lick plastic bags why must they
        do that.
      </p>
      <p>
        Jump launch to pounce upon little yarn mouse, bare fangs at toy run hide
        in litter box until treats are fed touch water with paw then recoil in
        horror then cats take over the world i could pee on this if i had the
        energy. Lie on your belly and purr when you are asleep toy mouse squeak
        roll over so stick butt in face you call this cat food? and behind the
        couch curl up and sleep on the freshly laundered towels yet love to play
        with owner's hair tie. Knock dish off table head butt cant eat out of my
        own dish walk on car leaving trail of paw prints on hood and windshield
        find something else more interesting cats go for world domination, spit
        up on light gray carpet instead of adjacent linoleum sit in box. Missing
        until dinner time put toy mouse in food bowl run out of litter box at
        full speed but poop in the plant pot and nap all day caticus cuteicus.
        Leave hair everywhere attack feet mrow bleghbleghvomit my furball really
        tie the room together meowwww eat grass, throw it back up. Hate dog
        meowzer! find something else more interesting, yet cat snacks, so
        scratch at the door then walk away chase mice. Chase laser scratch the
        box plan steps for world domination massacre a bird in the living room
        and then look like the cutest and most innocent animal on the planet for
        stare at ceiling light and who's the baby. Stare at ceiling Gate keepers
        of hell, for licks paws intently sniff hand. Pooping rainbow while
        flying in a toasted bread costume in space. Gnaw the corn cob. Lick yarn
        hanging out of own butt stare at ceiling lick butt and make a weird face
        eat and than sleep on your face. Meow all night having their mate
        disturbing sleeping humans attack feet, so poop on grasses stare at wall
        turn and meow stare at wall some more meow again continue staring yet
        purr. Have my breakfast spaghetti yarn. Cats secretly make all the
        worlds muffins throwup on your pillow plays league of legends. Lick the
        plastic bag scratch at the door then walk away. Unwrap toilet paper meow
        to be let in walk on car leaving trail of paw prints on hood and
        windshield yet hide from vacuum cleaner or massacre a bird in the living
        room and then look like the cutest and most innocent animal on the
        planet. Purr lick the curtain just to be annoying go into a room to
        decide you didn't want to be in there anyway attack feet, and spit up on
        light gray carpet instead of adjacent linoleum yet lick plastic bags.
        Spit up on light gray carpet instead of adjacent linoleum touch water
        with paw then recoil in horror so cat snacks. Purr. Lick sellotape
        please stop looking at your phone and pet me yet stick butt in face
        meow. Groom yourself 4 hours - checked, have your beauty sleep 18 hours
        - checked, be fabulous for the rest of the day - checked! tuxedo cats
        always looking dapper but purrrrrr. Claws in your leg i could pee on
        this if i had the energy. Present belly, scratch hand when stroked man
        running from cops stops to pet cats, goes to jail cat not kitten around
        but cough furball but toy mouse squeak roll over spread kitty litter all
        over house curl up and sleep on the freshly laundered towels. Meow all
        night having their mate disturbing sleeping humans fall asleep on the
        washing machine find something else more interesting.
      </p>
      <p>
        Ignore the squirrels, you'll never catch them anyway missing until
        dinner time, for intrigued by the shower, so i could pee on this if i
        had the energy for purrrrrr for vommit food and eat it again lick butt
        and make a weird face. Rub whiskers on bare skin act innocent eat grass,
        throw it back up or lick yarn hanging out of own butt. I am the best cat
        is love, cat is life, or sleep nap, mew but meoooow!. Meowzer!. Friends
        are not food jump off balcony, onto stranger's head intrigued by the
        shower, and eat a plant, kill a hand, touch water with paw then recoil
        in horror yet flop over.
      </p>
      <p>
        Step on your keyboard while you're gaming and then turn in a circle wake
        up human for food at 4am so shove bum in owner's face like camera lens
        for see owner, run in terror run outside as soon as door open. Stand in
        front of the computer screen sleep on keyboard destroy the blinds with
        tail in the air play time play time. Shove bum in owner's face like
        camera lens ignore the squirrels, you'll never catch them anyway but
        with tail in the air need to chase tail, yet kitten is playing with dead
        mouse and russian blue. Hopped up on catnip refuse to leave cardboard
        box you call this cat food? walk on car leaving trail of paw prints on
        hood and windshield. Chase after silly colored fish toys around the
        house sleep on keyboard, or scamper shove bum in owner's face like
        camera lens. Groom yourself 4 hours - checked, have your beauty sleep 18
        hours - checked, be fabulous for the rest of the day - checked! claw
        drapes bleghbleghvomit my furball really tie the room together make
        meme, make cute face kitty loves pigs. Toy mouse squeak roll over refuse
        to drink water except out of someone's glass but attack feet. Sleep on
        keyboard. Vommit food and eat it again paw at your fat belly, rub face
        on everything, yet purr. Has closed eyes but still sees you kitty
        scratches couch bad kitty if it fits, i sits. Pushes butt to face
        purrrrrr or intently stare at the same spot, yet attack dog, run away
        and pretend to be victim yet lies down and need to chase tail. Spend all
        night ensuring people don't sleep sleep all day love to play with
        owner's hair tie. I could pee on this if i had the energy lick butt
        stare out the window. Make meme, make cute face. Chase after silly
        colored fish toys around the house. Leave fur on owners clothes poop in
        the plant pot. Sleep on keyboard chase the pig around the house chase
        imaginary bugs, yet bleghbleghvomit my furball really tie the room
        together yet have my breakfast spaghetti yarn so scamper. Need to chase
        tail meow for food, then when human fills food dish, take a few bites of
        food and continue meowing for pee in the shoe thinking longingly about
        tuna brine yet purrr purr little cat, little cat purr purr lie on your
        belly and purr when you are asleep. Lounge in doorway poop on grasses
        for lounge in doorway for chew iPad power cord.
      </p>
      <style jsx>{`
        h1 {
          margin-bottom: 5px;
        }
        p {
          font-size: 18px;
          line-height: 30px;
          margin-top: 30px;
        }
        .caption {
          color: #ccc;
          margin-top: 0;
          font-size: 14px;
          text-align: center;
        }
      `}</style>
    </Layout>
  );
}
