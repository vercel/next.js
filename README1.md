                                                            Client Side vs. Server Side

Website scripts run in one of two places – the client side, also called the front-end, or the server side, also called the back-end. The client of a website refers to the web browser that is viewing it. The server of a website is, of course, the server that hosts it.

Most web coding languages are designed to run on either the server side or the client side. This largely defines how they work. Here are some examples.
Client Side Languages

Client side development is done almost exclusively in JavaScript. This is, of course, in addition to basic HTML and CSS code. The reason JavaScript is called a client side language is because it runs scripts on your computer after you’ve loaded a web page. Here’s an example:

<script>
    document.getElementById('hello').innerHTML = 'Hello';
</script>

That JavaScript code takes the string ‘Hello’ and pops it into the element with an ID of ‘hello’ – let’s say it was an <h1>. What was originally inside that element gets replaced, but if you open up the source code of that page, you’ll still see that original text and not ‘Hello’.

This is because ‘Hello, world!’ was dynamically added to the HTML document – it was not a part of the original document that was loaded by your browser. However, what you will be able to see see is the JavaScript code which was run by your computer.
Server Side Languages

A server side or back-end language runs its scripts before the HTML is loaded, not after.

There are a range of server side languages in use on the web today. PHP is one of the most popular, as well as Ruby on Rails, ASP.NET and many others. They are called server side languages because their scripts are run not on your computer, but on the server which hosts the website and sends down the HTML code.

Consider this PHP code:

<h1 id="hello"><?php echo 'Hello'; ?></h1>

This code has the exact same effect as the JavaScript code we looked at in the previous section. It puts the string ‘Hello, world!’ into the <h1> element with an ID of ‘hello’. But view the HTML source and what you see is a different story. Inside the <h1> tags will be the string ‘Hello’.

On the other hand, the PHP code that was run by the server will be nowhere to be seen. This is because the server will have already taken care of the PHP, and what gets sent to your computer is the resulting pure HTML.
Conclusion

Most websites make use of both a client side and a server side language. Although there are things both can do, there are some things which can only be done server side, and there are some things which can only be done client side.

Front-end scripting is good for anything that requires user interaction, such as a simple game. Back-end scripting is good for anything that requires dynamic data to be loaded, such as a notice that tells the user they’re logged in.

To write your own front-end and back-end scripts, you should learn web development.
Recommended Training – Treehouse

TreehouseAlthough this site recommends various training services, our top recommendation is Treehouse.

Treehouse is an online training service that teaches web design, web development and app development with videos, quizzes and interactive coding exercises.

Treehouse's mission is to bring technology education to those who can't get it, and is committed to helping its students find jobs. If you're looking to turn coding into your career, you should consider Treehouse.






