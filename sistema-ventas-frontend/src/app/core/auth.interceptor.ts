
import {
  HttpRequest,
  HttpEvent,
  HttpInterceptorFn,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, catchError } from 'rxjs';
/* import { ToasterService } from '@project/services/toaster.service'; */
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { GeneralService } from './gerneral.service';


export const AuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const router = inject(Router);
  const storage = inject(GeneralService);
/*   const toaster = inject(ToasterService); */
  const translate = inject(TranslateService)
  const token = storage.getToken() ?? 'aaaaa';
  console.log(token);
  req = req.clone({
    url: `${req.url}`,
    setHeaders: {
      Authorization: `${token}`,
      'platform-seed': environment.platformSeed,
      
    },
    withCredentials: false
  });
  return next(req).pipe(
    
    catchError((error) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) {
          /* toaster.showToast({
            severity: 'error',
            detail: translate.instant("message.userDisable"),
            summary: ''
          }) */

          router.navigate(['/login']);
        }
      }
      return throwError(() => error);
    })
  );
};

