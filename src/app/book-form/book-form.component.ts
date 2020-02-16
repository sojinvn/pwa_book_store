import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BackendService } from '../services/backend.service';
import { BookOfflineService } from '../services/book-offline.service';
import { OnlineOfflineService } from '../services/online-offline.service';
import { Book } from '../books/books.component';

@Component({
  selector: 'app-book-form',
  templateUrl: './book-form.component.html',
  styleUrls: ['./book-form.component.css']
})
export class BookFormComponent implements OnInit {
  public bookId: string;
  public title: string = '';
  public isbn: string = '';
  public author: string = '';
  public picture: string = '';
  public price: number = 0;
  static URL_REGEXP = /^http(s*):\/\/.+/;
  static BOOKS_PAGE = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private backendService: BackendService,
    private bookOfflineService: BookOfflineService,
    private onlineOfflineService: OnlineOfflineService,
  ) { }

  ngOnInit() {
    // Get the url pramater
    this.bookId = this.route.snapshot.paramMap.get('id');
    // Load the book data from the database if a book id is passed
    if (this.onlineOfflineService.isOnline) {
      if (this.bookId) this.backendService.fetchBook(this.bookId).subscribe((data: Book[]) => {
        // Book exists
        if (data.length !== 0) {
          this.title = data[0].title;
          this.isbn = data[0].isbn;
          this.author = data[0].author;
          this.price = data[0].price;
          this.picture = data[0].picture;
        } else {
          this.bookId = null;
          // Show an error message and navigate back to the main page
          this.snackBar.open("The book does not exist", 'Close', { duration: 2000 });
          this.router.navigate([BookFormComponent.BOOKS_PAGE]);
        }
      });
    } else {
      if (this.bookId) this.bookOfflineService.fecthSingleItemFromRDb(this.bookId).then((book) => {
        if (book) {
          this.title = book.title;
          this.isbn = book.isbn;
          this.author = book.author;
          this.price = book.price;
          this.picture = book.picture;
        } else {
          this.bookId = null;
          // Show an error message and navigate back to the main page
          this.snackBar.open("The book does not exist", 'Close', { duration: 2000 });
          this.router.navigate([BookFormComponent.BOOKS_PAGE]);
        }
      },
        (error) => console.error(error));
    }
  }

  handleSave() {
    let message: string;
    // If the the form input values are invalid, show a snackbar
    if (this.title.trim() === '' || this.isbn.trim() === '' || this.author.trim() === '')
      message = 'Please finish the form.';
    else if (!BookFormComponent.URL_REGEXP.test(this.picture))
      message = 'The picture should be start with http:// or https://';
    else if (this.price <= 0)
      message = 'Price should be greater than 0.'
    else {
      // Call the add book API and reset all form input vaules
      message = 'Operation sccuessful!';
      // If there is an Internet connection, save the data to MongoDB; otherwise, save to IndexedDB
      if (this.onlineOfflineService.isOnline) {
        this.backendService.addOrUpdateBook({
          title: this.title, isbn: this.isbn, author: this.author,
          picture: this.picture, price: this.price, _id: this.bookId,
        }).subscribe(() => {
          this.clearForm();
        });
      } else {
        // Save data locally
        this.saveOffline();
      }
    }
    this.snackBar.open(message, 'Close', { duration: 2000 });
  }

  async saveOffline() {
    await this.bookOfflineService.saveOffline(
      this.title, this.isbn, this.author, this.picture, this.price, this.bookId, false);
    this.clearForm();
  }

  clearForm() {
    this.title = '';
    this.isbn = '';
    this.author = '';
    this.picture = '';
    this.price = 0;
    this.bookId = null;
    this.router.navigate([BookFormComponent.BOOKS_PAGE]);
  }
}