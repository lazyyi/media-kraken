import jaws from '@tests/fixtures/json/jaws.json';
import jawsTmdb from '@tests/fixtures/tmdb/jaws.json';
import jawsTmdbSearchResult from '@tests/fixtures/tmdb/jaws-search-result.json';
import loveExposure from '@tests/fixtures/json/love-exposure.json';
import loveExposureTmdb from '@tests/fixtures/tmdb/love-exposure.json';
import loveExposureTmdbSearchResult from '@tests/fixtures/tmdb/love-exposure-search-result.json';
import spirit from '@tests/fixtures/json/spirit.json';
import spiritLD from '@tests/fixtures/jsonld/spirit.json';
import symbol from '@tests/fixtures/json/symbol.json';

describe('Media', () => {

    beforeEach(() => {
        cy.visit('/');
        cy.startApp();
        cy.login();
    });

    it('Adds movies from search', () => {
        // Arrange
        cy.fetchRoute(`/movie/${jawsTmdbSearchResult.id}`, jawsTmdb);
        cy.fetchRoute(`/movie/${loveExposureTmdbSearchResult.id}`, loveExposureTmdb);
        cy.fetchRoute('/search/movie?query=Jaws', { results: [jawsTmdbSearchResult] });
        cy.fetchRoute('/search/movie?query=Love+Exposure', {
            results: [loveExposureTmdbSearchResult],
        });

        // Act
        cy.get('body').type('s');
        cy.get('body').type('Jaws');
        cy.ariaLabel('Search results').contains('Jaws').click();
        cy.ariaRole('dialog').contains('watch later').click();

        cy.get('body').type('s');
        cy.get('body').type('Love Exposure');
        cy.ariaLabel('Search results').contains('Love Exposure').click();
        cy.ariaRole('dialog').contains('watched').click();

        // Assert
        cy.see('Jaws has been added to your collection!');
        cy.see('Love Exposure has been added to your collection!');

        cy.contains('My Collection').click();
        cy.see('Collection (2)');

        cy.seeImage(jaws.image);
        cy.seeImage(loveExposure.image);
        cy.anchorWithTitle(`${jaws.name} (Watch later)`).should('be.visible');
        cy.anchorWithTitle(`${loveExposure.name} (Watched)`).should('be.visible');

        cy.visit('/collection');
        cy.startApp();
        cy.seeImage(jaws.image);
        cy.seeImage(loveExposure.image);
        cy.anchorWithTitle(`${jaws.name} (Watch later)`).should('be.visible');
        cy.anchorWithTitle(`${loveExposure.name} (Watched)`).should('be.visible');
    });

    it('Imports movies from JSON-LD', () => {
        // Act
        cy.contains('Yes, I have some movies I\'d like to import').click();
        cy.buttonWithTitle('Import from JSON-LD').click();
        cy.uploadFixture('collection.json');

        // Assert
        cy.see('1 movies have been added to your collection to watch later');
        cy.see('1 watched movies have been added to your collection');

        cy.contains('OK').click();
        cy.contains('My Collection').click();

        cy.see('Collection (2)');
        cy.seeImage(symbol.image);
        cy.seeImage(jaws.image);

        cy.anchorWithTitle(`${symbol.name} (Watched)`).click();
        cy.see('watched');

        cy.contains('My Collection').click();
        cy.anchorWithTitle(`${jaws.name} (Watch later)`).click();
        cy.see('watch later');

        cy.visit('/collection');
        cy.startApp();

        cy.seeImage(symbol.image);
        cy.anchorWithTitle(`${symbol.name} (Watched)`).should('be.visible');

        cy.seeImage(jaws.image);
        cy.anchorWithTitle(`${jaws.name} (Watch later)`).should('be.visible');
    });

    it('Opens collection in mobile layout', () => {
        // Arrange
        cy.viewport('samsung-s10');
        cy.addMovie(spiritLD);

        // Act
        cy.ariaLabel('Open menu').click();
        cy.contains('My Collection').click();

        // Assert
        cy.see('Collection (1)');
        cy.url().should('include', '/collection');
    });

    it('Deletes movies', () => {
        // Arrange
        cy.addMovie(spiritLD);
        cy.contains('My Collection').click();
        cy.anchorWithTitle(`${spirit.name} (Watched)`).click();

        // Act
        cy.ariaLabel('Open actions menu').click();
        cy.contains('Delete').click();
        cy.contains('OK').click();

        // Assert
        cy.see(`${spirit.name} has been removed from your collection.`);
    });

    it('Marks movies as watch later', () => {
        // Arrange
        cy.addMovie(spiritLD);
        cy.contains('My Collection').click();
        cy.anchorWithTitle(`${spirit.name} (Watched)`).click();

        // Act
        cy.ariaLabel('Open actions menu').click();
        cy.contains('Watch later').click();
        cy.contains('OK').click();

        // Assert
        cy.contains('watch later');

        cy.visit('/collection');
        cy.startApp();

        cy.anchorWithTitle(`${spirit.name} (Watch later)`).should('be.visible');
    });

});
