import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { Book } from '../books/books.component';
import { OnlineOfflineService } from './online-offline.service';
import { v1 as uuidv1 } from 'uuid'; // For generating time-based uuid
import { BackendService } from '../services/backend.service';
import { MatSnackBar } from '@angular/material/snack-bar';

const BOOK_STATE_CREATED = "CREATED";
const BOOK_STATE_UPDATED = "UPDATED";
const BOOK_STATE_DELETED = "DELETED";

@Injectable({ providedIn: 'root' })
export class BookOfflineService {
    private rDb: any; // this database is for caching data from the MongoDB
    private cudDb: any; // this database is for storing new data, modified data, and deleted data

    constructor(
        private onlineOfflineService: OnlineOfflineService,
        private backendService: BackendService,
        private snackBar: MatSnackBar
    ) {
        // Listen to network status events (i.e. online and offline)
        this.registerToEvents(onlineOfflineService);
        this.createDatabases();
        // Attempt to sync the offline-saved data when the user reopens the tab/browser
        this.sendItemsFromCUDDb();
    }

    // Observe network status (i.e. online or offline)
    private registerToEvents(onlineOfflineService: OnlineOfflineService) {
        onlineOfflineService.connectionChanged.subscribe(online => {
            if (online) {
                this.snackBar.open("You are back online", 'Close', { duration: 2000 });
                // Sync the CUDDB to the remote server when the server is back online
                this.sendItemsFromCUDDb();
            } else {
                this.snackBar.open("You are working offline", 'Close', { duration: 2000 });
            }
        });
    }

    private createDatabases() {
        this.rDb = new Dexie('RBooks');
        this.rDb.version(1).stores({
            books: '_id,title,isbn,author,price,picture'
        });
        this.cudDb = new Dexie('CUDBooks');
        this.cudDb.version(1).stores({
            books: '_id,title,isbn,author,price,picture,state'
        });
    }

    // For saving new items, edited items, and deleted items when no connection is available
    public async saveOffline(title: string, isbn: string, author: string, picture: string, price: number, _id: null | string, isDeleted: boolean) {
        let book: Book;
        // New book
        if (!_id || _id === '') {
            // A random ID is assigned for the book object. The ID is ignored upon saving the object to MongoDB; however, it
            // is necessary to assign the ID for saving in IndexedDB
            book = {
                _id: uuidv1(), title: title, isbn: isbn, author: author,
                picture: picture, price: price, state: BOOK_STATE_CREATED
            };
            this.putToCUDDb(book);
            this.putToRDb(book);
        } else {
            await this.fecthSingleItemFromRDb(_id).then(async (tmpBook) => {
                // Item does not exist on the remote server
                if (tmpBook.state === BOOK_STATE_CREATED) {
                    // Update local db and remote db
                    if (!isDeleted) {
                        book = {
                            _id: _id, title: title, isbn: isbn, author: author,
                            picture: picture, price: price, state: BOOK_STATE_CREATED
                        };
                        this.putToCUDDb(book);
                        this.putToRDb(book);
                    }
                    // Delete from local db; item won't be uploaded to remote db
                    else {
                        this.deleteFromCUDDb(_id)
                        this.deleteFromRDb(_id);
                    }
                }
                // Item exists on the remote server
                else {
                    // Update local db and remote db
                    if (!isDeleted) {
                        book = {
                            _id: _id, title: title, isbn: isbn, author: author,
                            picture: picture, price: price, state: BOOK_STATE_UPDATED
                        };
                        this.putToCUDDb(book);
                        this.putToRDb(book);
                    }
                    // Delete from local db and remote db
                    else {
                        book = {
                            _id: _id, title: title, isbn: isbn, author: author,
                            picture: picture, price: price, state: BOOK_STATE_DELETED
                        };
                        this.putToCUDDb(book);
                        this.deleteFromRDb(_id);
                    }
                }
            }, (error) => console.error(error));
        }
    }

    private putToCUDDb(book: Book) {
        this.cudDb.books
            .put(book)
            .catch(e => {
                alert('Error: ' + (e.stack || e));
            });
    }

    private deleteFromCUDDb(_id: string) {
        this.cudDb.books
            .delete(_id)
            .catch(e => {
                alert('Error: ' + (e.stack || e));
            });
    }

    public putToRDb(book: Book) {
        this.rDb.books
            .put(book)
            .catch(e => {
                alert('Error: ' + (e.stack || e));
            });
    }

    public deleteFromRDb(_id: string) {
        this.rDb.books
            .delete(_id)
            .catch(e => {
                alert('Error: ' + (e.stack || e));
            });
    }

    public bulkAddToRDb(books: Array<Book>) {
        this.rDb.books
            .bulkAdd(books)
            .catch(e => {
                alert('Error: ' + (e.stack || e));
            });
    }

    public clearRDb() {
        this.rDb.books.clear();
    }

    public async fecthAllItemsFromRDb() {
        const books: Book[] = await this.rDb.books.toArray();
        return books;
    }

    public async fecthSingleItemFromRDb(_id: string) {
        const book: Book = await this.rDb.books.get(_id);
        return book;
    }

    // Synchronize CUDDB to the remote database.
    // If an item is failed to send (i.e. response status is different from 200), it will not be removed from the local DB.
    // Failed items will wait for the next database sync.
    private async sendItemsFromCUDDb() {
        const books: Book[] = await this.cudDb.books.toArray();
        const status = { isSuccessful: false };
        books.forEach(async (book: Book) => {
            // Create new book in MongoDB
            if (book.state === BOOK_STATE_CREATED) {
                await this.backendService.addOrUpdateBook({
                    title: book.title, isbn: book.isbn, author: book.author,
                    picture: book.picture, price: book.price, _id: null
                }).subscribe(res => {
                    // Delete the item locally only if the sync was successfull
                    if (res.status == 200) {
                        this.deleteFromCUDDb(book._id);
                        status.isSuccessful = true;
                    } else {
                        console.log(res); // Log error
                    }
                });
            }
            // Update a book in MongoDB
            else if (book.state === BOOK_STATE_UPDATED) {
                await this.backendService.addOrUpdateBook({
                    title: book.title, isbn: book.isbn, author: book.author,
                    picture: book.picture, price: book.price, _id: book._id
                }).subscribe(res => {
                    // Delete the item locally only if the sync was successfull
                    if (res.status == 200) {
                        this.deleteFromCUDDb(book._id);
                        status.isSuccessful = true;
                    } else {
                        console.log(res); // Log error
                    }
                });
            }
            // Delete a book in MongoDB
            else {
                await this.backendService.deleteBook(book._id).subscribe(res => {
                    // Delete the item locally only if the sync was successfull
                    if (res.status == 200) {
                        this.deleteFromCUDDb(book._id);
                        status.isSuccessful = true;
                    } else {
                        console.log(res); // Log error
                    }
                });
            }
        });
        if (status.isSuccessful) this.snackBar.open("New updates available. Please refresh this page!", 'Close', { duration: 5000 });
    }
}