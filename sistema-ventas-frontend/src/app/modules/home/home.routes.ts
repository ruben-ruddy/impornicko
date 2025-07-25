import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';
import { ProductComponent } from '../product/product.component';
import { ExampleCssComponent } from '../example-css/example-css.component';
import { CategoriesComponent } from '../categories/categories.component';
import { ClientsComponent } from '../clients/clients.component';
import { HomeMainComponent } from '../home-main/home-main.component';



export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    children: [
      {
        path: 'products',
        loadChildren: () => import('../product/produt.routes').then((m) => m.routes),
      },
      {
        path: 'style',
        component: ExampleCssComponent,
      },
      {
        path: 'category',
        component: CategoriesComponent,
      },
      {
        path: 'clients',
        component: ClientsComponent,
      },
      {
        path: 'home-main',
        component: HomeMainComponent,
      },
    ]
  },
  

 
 
];
