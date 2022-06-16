Feature: About page

    Scenario: Navigating to the about page
        Given I open the "/" page
        When I click on the "about" link
        Then I see "about" in the url
        And I see "About Page" in the "h1"
