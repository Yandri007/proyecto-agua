import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import 'package:aquacontrol/main.dart';

void main() {
  testWidgets('App smoke test - monta la aplicación correctamente', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: AquaControlApp(),
      ),
    );
    // Verificar que la app carga sin errores
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.byType(Router), findsOneWidget);
  });
}
